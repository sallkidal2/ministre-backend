import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectFiltersSchema,
  type ProjectWithRelations,
} from "../types";
import { getAuthUser } from "./auth";

const projectsRouter = new Hono();

// Helper to parse JSON fields
function parseJsonArray(value: string | null): string[] | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatProject(p: any): ProjectWithRelations {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    departmentId: p.department_id,
    regionId: p.region_id,
    sectorId: p.sector_id,
    budget: p.budget,
    plannedBudget: p.planned_budget,
    startDate: p.start_date ?? null,
    endDate: p.end_date ?? null,
    progress: p.progress,
    status: p.status as ProjectWithRelations["status"],
    responsibleName: p.responsible_name,
    responsiblePhone: p.responsible_phone,
    documents: parseJsonArray(p.documents),
    photos: parseJsonArray(p.photos),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    department: {
      id: p.departments?.id ?? "",
      name: p.departments?.name ?? "",
      code: p.departments?.code ?? "",
    },
    region: {
      id: p.regions?.id ?? "",
      name: p.regions?.name ?? "",
      code: p.regions?.code ?? "",
    },
    sector: {
      id: p.sectors?.id ?? "",
      name: p.sectors?.name ?? "",
    },
    _count: p._count,
  };
}

// GET /api/projects
projectsRouter.get("/", zValidator("query", ProjectFiltersSchema), async (c) => {
  const filters = c.req.valid("query");

  let query = supabase
    .from("projects")
    .select(`
      *,
      departments (id, name, code),
      regions (id, name, code),
      sectors (id, name)
    `)
    .order("created_at", { ascending: false });

  if (filters.regionId) query = query.eq("region_id", filters.regionId);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.sectorId) query = query.eq("sector_id", filters.sectorId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,responsible_name.ilike.%${filters.search}%`
    );
  }

  const { data: projects, error } = await query;

  if (error) {
    console.error("Error fetching projects:", error);
    return c.json({ error: { message: "Erreur lors de la recuperation des projets", code: "DATABASE_ERROR" } }, 500);
  }

  // Get beneficiary counts for each project
  const projectIds = projects?.map((p) => p.id) || [];

  let beneficiaryCounts: Record<string, number> = {};
  if (projectIds.length > 0) {
    const { data: counts, error: countError } = await supabase
      .from("beneficiaries")
      .select("project_id")
      .in("project_id", projectIds);

    if (!countError && counts) {
      beneficiaryCounts = counts.reduce((acc: Record<string, number>, b) => {
        acc[b.project_id] = (acc[b.project_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  const data = (projects || []).map((p) => formatProject({
    ...p,
    _count: { beneficiaries: beneficiaryCounts[p.id] || 0 },
  }));

  return c.json({ data });
});

// GET /api/projects/:id
projectsRouter.get("/:id", async (c) => {
  const { id } = c.req.param();

  const { data: project, error } = await supabase
    .from("projects")
    .select(`
      *,
      departments (id, name, code),
      regions (id, name, code),
      sectors (id, name)
    `)
    .eq("id", id)
    .single();

  if (error || !project) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Get beneficiary count
  const { count } = await supabase
    .from("beneficiaries")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);

  return c.json({
    data: formatProject({
      ...project,
      _count: { beneficiaries: count || 0 },
    }),
  });
});

// POST /api/projects
projectsRouter.post("/", zValidator("json", CreateProjectSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const body = c.req.valid("json");

  // If admin_department, can only create for their department
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== body.departmentId) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Validate references
  const [departmentRes, regionRes, sectorRes] = await Promise.all([
    supabase.from("departments").select("id").eq("id", body.departmentId).single(),
    supabase.from("regions").select("id").eq("id", body.regionId).single(),
    supabase.from("sectors").select("id").eq("id", body.sectorId).single(),
  ]);

  if (departmentRes.error || !departmentRes.data) {
    return c.json({ error: { message: "Departement non trouve", code: "INVALID_DEPARTMENT" } }, 400);
  }
  if (regionRes.error || !regionRes.data) {
    return c.json({ error: { message: "Region non trouvee", code: "INVALID_REGION" } }, 400);
  }
  if (sectorRes.error || !sectorRes.data) {
    return c.json({ error: { message: "Secteur non trouve", code: "INVALID_SECTOR" } }, 400);
  }

  const projectId = createId();
  const now = new Date().toISOString();

  const { data: project, error: createError } = await supabase
    .from("projects")
    .insert({
      id: projectId,
      name: body.name,
      description: body.description ?? null,
      department_id: body.departmentId,
      region_id: body.regionId,
      sector_id: body.sectorId,
      budget: body.budget ?? null,
      planned_budget: body.plannedBudget ?? null,
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      progress: body.progress ?? 0,
      status: body.status ?? "PENDING_VALIDATION",
      responsible_name: body.responsibleName ?? null,
      responsible_phone: body.responsiblePhone ?? null,
      documents: body.documents ? JSON.stringify(body.documents) : null,
      photos: body.photos ? JSON.stringify(body.photos) : null,
      created_at: now,
      updated_at: now,
    })
    .select(`
      *,
      departments (id, name, code),
      regions (id, name, code),
      sectors (id, name)
    `)
    .single();

  if (createError || !project) {
    console.error("Error creating project:", createError);
    return c.json({ error: { message: "Erreur lors de la creation du projet", code: "DATABASE_ERROR" } }, 500);
  }

  // Automatically create a validation request for project approval
  const validationId = createId();
  const { error: validationError } = await supabase
    .from("validation_requests")
    .insert({
      id: validationId,
      type: "PROJECT_APPROVAL",
      status: "PENDING",
      project_id: project.id,
      requester_id: user.id,
      comment: "Demande d'approbation pour nouveau projet",
      created_at: now,
      updated_at: now,
    });

  if (validationError) {
    console.error("Error creating validation request:", validationError);
  }

  // Notify approvers (MINISTER, PRIMATURE, PRESIDENCY, SUPER_ADMIN)
  const { data: approvers } = await supabase
    .from("users")
    .select("id")
    .in("role", ["MINISTER", "PRIMATURE", "PRESIDENCY", "SUPER_ADMIN"])
    .eq("is_active", true);

  if (approvers && approvers.length > 0) {
    const notifications = approvers.map((approver) => ({
      id: createId(),
      type: "VALIDATION_REQUEST",
      title: "Nouveau projet a valider",
      message: `${user.name} a soumis le projet "${project.name}" pour approbation`,
      user_id: approver.id,
      link: `/validations`,
      is_read: false,
      created_at: now,
    }));

    const { error: notifError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (notifError) {
      console.error("Error creating notifications:", notifError);
    }
  }

  return c.json({
    data: formatProject({
      ...project,
      _count: { beneficiaries: 0 },
    }),
  }, 201);
});

// PUT /api/projects/:id
projectsRouter.put("/:id", zValidator("json", UpdateProjectSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const { data: existing, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only update their department's projects
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Validate references if being changed
  if (body.departmentId) {
    const { data: dept, error: deptError } = await supabase
      .from("departments")
      .select("id")
      .eq("id", body.departmentId)
      .single();
    if (deptError || !dept) {
      return c.json({ error: { message: "Departement non trouve", code: "INVALID_DEPARTMENT" } }, 400);
    }
  }
  if (body.regionId) {
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id")
      .eq("id", body.regionId)
      .single();
    if (regionError || !region) {
      return c.json({ error: { message: "Region non trouvee", code: "INVALID_REGION" } }, 400);
    }
  }
  if (body.sectorId) {
    const { data: sector, error: sectorError } = await supabase
      .from("sectors")
      .select("id")
      .eq("id", body.sectorId)
      .single();
    if (sectorError || !sector) {
      return c.json({ error: { message: "Secteur non trouve", code: "INVALID_SECTOR" } }, 400);
    }
  }

  // Build update data with snake_case columns
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.departmentId !== undefined) updateData.department_id = body.departmentId;
  if (body.regionId !== undefined) updateData.region_id = body.regionId;
  if (body.sectorId !== undefined) updateData.sector_id = body.sectorId;
  if (body.budget !== undefined) updateData.budget = body.budget;
  if (body.plannedBudget !== undefined) updateData.planned_budget = body.plannedBudget;
  if (body.startDate !== undefined) updateData.start_date = body.startDate;
  if (body.endDate !== undefined) updateData.end_date = body.endDate;
  if (body.progress !== undefined) updateData.progress = body.progress;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.responsibleName !== undefined) updateData.responsible_name = body.responsibleName;
  if (body.responsiblePhone !== undefined) updateData.responsible_phone = body.responsiblePhone;
  if (body.documents !== undefined) updateData.documents = JSON.stringify(body.documents);
  if (body.photos !== undefined) updateData.photos = JSON.stringify(body.photos);

  const { data: project, error: updateError } = await supabase
    .from("projects")
    .update(updateData)
    .eq("id", id)
    .select(`
      *,
      departments (id, name, code),
      regions (id, name, code),
      sectors (id, name)
    `)
    .single();

  if (updateError || !project) {
    console.error("Error updating project:", updateError);
    return c.json({ error: { message: "Erreur lors de la mise a jour du projet", code: "DATABASE_ERROR" } }, 500);
  }

  // Get beneficiary count
  const { count } = await supabase
    .from("beneficiaries")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);

  return c.json({
    data: formatProject({
      ...project,
      _count: { beneficiaries: count || 0 },
    }),
  });
});

// DELETE /api/projects/:id
projectsRouter.delete("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_DEPARTMENT")) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();

  const { data: existing, error: fetchError } = await supabase
    .from("projects")
    .select("department_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only delete their department's projects
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Delete related beneficiaries first
  const { error: deleteBenefError } = await supabase
    .from("beneficiaries")
    .delete()
    .eq("project_id", id);

  if (deleteBenefError) {
    console.error("Error deleting beneficiaries:", deleteBenefError);
  }

  // Delete the project
  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("Error deleting project:", deleteError);
    return c.json({ error: { message: "Erreur lors de la suppression du projet", code: "DATABASE_ERROR" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { projectsRouter };
