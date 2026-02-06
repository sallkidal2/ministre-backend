import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import {
  CreateBeneficiarySchema,
  UpdateBeneficiarySchema,
  BeneficiaryFiltersSchema,
  type BeneficiaryWithRelations,
} from "../types";
import { getAuthUser } from "./auth";

const beneficiariesRouter = new Hono();

function formatBeneficiary(b: any, region: any, sector: any, project: any): BeneficiaryWithRelations {
  return {
    id: b.id,
    firstName: b.first_name,
    lastName: b.last_name,
    gender: b.gender as BeneficiaryWithRelations["gender"],
    age: b.age,
    phone: b.phone,
    regionId: b.region_id,
    sectorId: b.sector_id,
    projectId: b.project_id,
    accompanimentStatus: b.accompaniment_status as BeneficiaryWithRelations["accompanimentStatus"],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    region: {
      id: region.id,
      name: region.name,
    },
    sector: {
      id: sector.id,
      name: sector.name,
    },
    project: {
      id: project.id,
      name: project.name,
    },
  };
}

// GET /api/beneficiaries
beneficiariesRouter.get("/", zValidator("query", BeneficiaryFiltersSchema), async (c) => {
  const filters = c.req.valid("query");

  let query = supabase.from("beneficiaries").select("*");

  if (filters.regionId) query = query.eq("region_id", filters.regionId);
  if (filters.sectorId) query = query.eq("sector_id", filters.sectorId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.accompanimentStatus) query = query.eq("accompaniment_status", filters.accompanimentStatus);
  if (filters.search) {
    query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
  }

  query = query.order("created_at", { ascending: false });

  const { data: beneficiaries, error } = await query;

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  // Fetch related regions, sectors, and projects
  const regionIds = [...new Set(beneficiaries.map((b: any) => b.region_id))];
  const sectorIds = [...new Set(beneficiaries.map((b: any) => b.sector_id))];
  const projectIds = [...new Set(beneficiaries.map((b: any) => b.project_id))];

  const [regionsRes, sectorsRes, projectsRes] = await Promise.all([
    supabase.from("regions").select("id, name").in("id", regionIds),
    supabase.from("sectors").select("id, name").in("id", sectorIds),
    supabase.from("projects").select("id, name").in("id", projectIds),
  ]);

  const regionsMap = new Map((regionsRes.data || []).map((r: any) => [r.id, r]));
  const sectorsMap = new Map((sectorsRes.data || []).map((s: any) => [s.id, s]));
  const projectsMap = new Map((projectsRes.data || []).map((p: any) => [p.id, p]));

  const data = beneficiaries.map((b: any) =>
    formatBeneficiary(
      b,
      regionsMap.get(b.region_id) || { id: b.region_id, name: "" },
      sectorsMap.get(b.sector_id) || { id: b.sector_id, name: "" },
      projectsMap.get(b.project_id) || { id: b.project_id, name: "" }
    )
  );

  return c.json({ data });
});

// GET /api/beneficiaries/:id
beneficiariesRouter.get("/:id", async (c) => {
  const { id } = c.req.param();

  const { data: beneficiary, error } = await supabase
    .from("beneficiaries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !beneficiary) {
    return c.json({ error: { message: "Beneficiaire non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Fetch related data
  const [regionRes, sectorRes, projectRes] = await Promise.all([
    supabase.from("regions").select("id, name").eq("id", beneficiary.region_id).single(),
    supabase.from("sectors").select("id, name").eq("id", beneficiary.sector_id).single(),
    supabase.from("projects").select("id, name").eq("id", beneficiary.project_id).single(),
  ]);

  return c.json({
    data: formatBeneficiary(
      beneficiary,
      regionRes.data || { id: beneficiary.region_id, name: "" },
      sectorRes.data || { id: beneficiary.sector_id, name: "" },
      projectRes.data || { id: beneficiary.project_id, name: "" }
    ),
  });
});

// POST /api/beneficiaries
beneficiariesRouter.post("/", zValidator("json", CreateBeneficiarySchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const body = c.req.valid("json");

  // Validate references
  const [regionRes, sectorRes, projectRes] = await Promise.all([
    supabase.from("regions").select("id, name").eq("id", body.regionId).single(),
    supabase.from("sectors").select("id, name").eq("id", body.sectorId).single(),
    supabase.from("projects").select("id, name, department_id").eq("id", body.projectId).single(),
  ]);

  if (!regionRes.data) {
    return c.json({ error: { message: "Region non trouvee", code: "INVALID_REGION" } }, 400);
  }
  if (!sectorRes.data) {
    return c.json({ error: { message: "Secteur non trouve", code: "INVALID_SECTOR" } }, 400);
  }
  if (!projectRes.data) {
    return c.json({ error: { message: "Projet non trouve", code: "INVALID_PROJECT" } }, 400);
  }

  // If admin_department, can only add to their department's projects
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== projectRes.data.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const now = new Date().toISOString();
  const newBeneficiary = {
    id: createId(),
    first_name: body.firstName,
    last_name: body.lastName,
    gender: body.gender,
    age: body.age,
    phone: body.phone,
    region_id: body.regionId,
    sector_id: body.sectorId,
    project_id: body.projectId,
    accompaniment_status: body.accompanimentStatus ?? "ACTIVE",
    created_at: now,
    updated_at: now,
  };

  const { data: beneficiary, error } = await supabase
    .from("beneficiaries")
    .insert(newBeneficiary)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({
    data: formatBeneficiary(
      beneficiary,
      regionRes.data,
      sectorRes.data,
      { id: projectRes.data.id, name: projectRes.data.name }
    ),
  }, 201);
});

// PUT /api/beneficiaries/:id
beneficiariesRouter.put("/:id", zValidator("json", UpdateBeneficiarySchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  // Get existing beneficiary with project
  const { data: existing, error: existingError } = await supabase
    .from("beneficiaries")
    .select("*, projects!inner(department_id)")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return c.json({ error: { message: "Beneficiaire non trouve", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only update their department's beneficiaries
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.projects.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Validate references if being changed
  if (body.regionId) {
    const { data: region } = await supabase.from("regions").select("id").eq("id", body.regionId).single();
    if (!region) {
      return c.json({ error: { message: "Region non trouvee", code: "INVALID_REGION" } }, 400);
    }
  }
  if (body.sectorId) {
    const { data: sector } = await supabase.from("sectors").select("id").eq("id", body.sectorId).single();
    if (!sector) {
      return c.json({ error: { message: "Secteur non trouve", code: "INVALID_SECTOR" } }, 400);
    }
  }
  if (body.projectId) {
    const { data: project } = await supabase.from("projects").select("id").eq("id", body.projectId).single();
    if (!project) {
      return c.json({ error: { message: "Projet non trouve", code: "INVALID_PROJECT" } }, 400);
    }
  }

  // Build update data with snake_case
  const updateData: any = { updated_at: new Date().toISOString() };
  if (body.firstName !== undefined) updateData.first_name = body.firstName;
  if (body.lastName !== undefined) updateData.last_name = body.lastName;
  if (body.gender !== undefined) updateData.gender = body.gender;
  if (body.age !== undefined) updateData.age = body.age;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.regionId !== undefined) updateData.region_id = body.regionId;
  if (body.sectorId !== undefined) updateData.sector_id = body.sectorId;
  if (body.projectId !== undefined) updateData.project_id = body.projectId;
  if (body.accompanimentStatus !== undefined) updateData.accompaniment_status = body.accompanimentStatus;

  const { data: beneficiary, error } = await supabase
    .from("beneficiaries")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  // Fetch related data
  const [regionRes, sectorRes, projectRes] = await Promise.all([
    supabase.from("regions").select("id, name").eq("id", beneficiary.region_id).single(),
    supabase.from("sectors").select("id, name").eq("id", beneficiary.sector_id).single(),
    supabase.from("projects").select("id, name").eq("id", beneficiary.project_id).single(),
  ]);

  return c.json({
    data: formatBeneficiary(
      beneficiary,
      regionRes.data || { id: beneficiary.region_id, name: "" },
      sectorRes.data || { id: beneficiary.sector_id, name: "" },
      projectRes.data || { id: beneficiary.project_id, name: "" }
    ),
  });
});

export { beneficiariesRouter };
