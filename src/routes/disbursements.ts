import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import {
  CreateDisbursementSchema,
  UpdateDisbursementSchema,
  type Disbursement,
  type DisbursementWithRelations,
} from "../types";
import { getAuthUser } from "./auth";

const disbursementsRouter = new Hono();

// Helper to format disbursement
function formatDisbursement(d: any): Disbursement {
  return {
    id: d.id,
    amount: d.amount,
    description: d.description,
    date: d.date,
    category: d.category as Disbursement["category"],
    projectId: d.project_id,
    createdById: d.created_by_id,
    receiptUrl: d.receipt_url,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

function formatDisbursementWithRelations(d: any, project: any, createdBy: any): DisbursementWithRelations {
  return {
    ...formatDisbursement(d),
    project: {
      id: project.id,
      name: project.name,
    },
    createdBy: {
      id: createdBy.id,
      name: createdBy.name,
      email: createdBy.email,
    },
  };
}

// GET /api/projects/:projectId/disbursements
disbursementsRouter.get("/projects/:projectId/disbursements", async (c) => {
  const { projectId } = c.req.param();

  // Verify project exists
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  const { data: disbursements, error } = await supabase
    .from("disbursements")
    .select("*")
    .eq("project_id", projectId)
    .order("date", { ascending: false });

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  // Fetch created by users
  const userIds = [...new Set(disbursements.map((d: any) => d.created_by_id))];
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email")
    .in("id", userIds);

  const usersMap = new Map((users || []).map((u: any) => [u.id, u]));

  const data = disbursements.map((d: any) =>
    formatDisbursementWithRelations(
      d,
      project,
      usersMap.get(d.created_by_id) || { id: d.created_by_id, name: "", email: "" }
    )
  );

  return c.json({ data });
});

// POST /api/projects/:projectId/disbursements
disbursementsRouter.post(
  "/projects/:projectId/disbursements",
  zValidator("json", CreateDisbursementSchema),
  async (c) => {
    const user = await getAuthUser(c);

    if (!user) {
      return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
    }

    const { projectId } = c.req.param();
    const body = c.req.valid("json");

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name, department_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
    }

    // If admin_department, can only add disbursements to their department's projects
    if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== project.department_id) {
      return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
    }

    const now = new Date().toISOString();
    const newDisbursement = {
      id: createId(),
      amount: body.amount,
      description: body.description,
      date: body.date ? new Date(body.date).toISOString() : now,
      category: body.category ?? "OTHER",
      project_id: projectId,
      created_by_id: user.id,
      receipt_url: body.receiptUrl,
      created_at: now,
      updated_at: now,
    };

    const { data: disbursement, error } = await supabase
      .from("disbursements")
      .insert(newDisbursement)
      .select()
      .single();

    if (error) {
      return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
    }

    return c.json({
      data: formatDisbursementWithRelations(
        disbursement,
        { id: project.id, name: project.name },
        { id: user.id, name: user.name, email: user.email }
      ),
    }, 201);
  }
);

// PUT /api/disbursements/:id
disbursementsRouter.put(
  "/disbursements/:id",
  zValidator("json", UpdateDisbursementSchema),
  async (c) => {
    const user = await getAuthUser(c);

    if (!user) {
      return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    // Get existing disbursement with project
    const { data: existing, error: existingError } = await supabase
      .from("disbursements")
      .select("*, projects!inner(id, name, department_id)")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return c.json({ error: { message: "Decaissement non trouve", code: "NOT_FOUND" } }, 404);
    }

    // If admin_department, can only update disbursements of their department's projects
    if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.projects.department_id) {
      return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
    }

    // Build update data with snake_case
    const updateData: any = { updated_at: new Date().toISOString() };
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.date !== undefined) updateData.date = body.date ? new Date(body.date).toISOString() : null;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.receiptUrl !== undefined) updateData.receipt_url = body.receiptUrl;

    const { data: disbursement, error } = await supabase
      .from("disbursements")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
    }

    // Fetch created by user
    const { data: createdBy } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", disbursement.created_by_id)
      .single();

    return c.json({
      data: formatDisbursementWithRelations(
        disbursement,
        { id: existing.projects.id, name: existing.projects.name },
        createdBy || { id: disbursement.created_by_id, name: "", email: "" }
      ),
    });
  }
);

// DELETE /api/disbursements/:id
disbursementsRouter.delete("/disbursements/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  // Get existing disbursement with project
  const { data: existing, error: existingError } = await supabase
    .from("disbursements")
    .select("*, projects!inner(department_id)")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return c.json({ error: { message: "Decaissement non trouve", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only delete disbursements of their department's projects
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.projects.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { error } = await supabase
    .from("disbursements")
    .delete()
    .eq("id", id);

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { disbursementsRouter };
