import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import {
  CreateMilestoneSchema,
  UpdateMilestoneSchema,
  type Milestone,
} from "../types";
import { getAuthUser } from "./auth";

const milestonesRouter = new Hono();

// Helper to format milestone
function formatMilestone(m: any): Milestone {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    dueDate: m.due_date,
    completedDate: m.completed_date,
    status: m.status as Milestone["status"],
    projectId: m.project_id,
    order: m.order,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

// GET /api/projects/:projectId/milestones
milestonesRouter.get("/projects/:projectId/milestones", async (c) => {
  const { projectId } = c.req.param();

  // Verify project exists
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  const { data: milestones, error } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("order", { ascending: true });

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: milestones.map(formatMilestone) });
});

// POST /api/projects/:projectId/milestones
milestonesRouter.post(
  "/projects/:projectId/milestones",
  zValidator("json", CreateMilestoneSchema),
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
      .select("id, department_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
    }

    // If admin_department, can only add milestones to their department's projects
    if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== project.department_id) {
      return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
    }

    // Get max order for this project
    const { data: maxOrderResult } = await supabase
      .from("milestones")
      .select("order")
      .eq("project_id", projectId)
      .order("order", { ascending: false })
      .limit(1)
      .single();

    const maxOrder = maxOrderResult?.order ?? -1;

    const now = new Date().toISOString();
    const newMilestone = {
      id: createId(),
      title: body.title,
      description: body.description,
      due_date: body.dueDate ? new Date(body.dueDate).toISOString() : null,
      completed_date: body.completedDate ? new Date(body.completedDate).toISOString() : null,
      status: body.status ?? "PENDING",
      project_id: projectId,
      order: body.order ?? maxOrder + 1,
      created_at: now,
      updated_at: now,
    };

    const { data: milestone, error } = await supabase
      .from("milestones")
      .insert(newMilestone)
      .select()
      .single();

    if (error) {
      return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
    }

    return c.json({ data: formatMilestone(milestone) }, 201);
  }
);

// PUT /api/milestones/:id
milestonesRouter.put(
  "/milestones/:id",
  zValidator("json", UpdateMilestoneSchema),
  async (c) => {
    const user = await getAuthUser(c);

    if (!user) {
      return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    // Get existing milestone with project
    const { data: existing, error: existingError } = await supabase
      .from("milestones")
      .select("*, projects!inner(department_id)")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return c.json({ error: { message: "Jalon non trouve", code: "NOT_FOUND" } }, 404);
    }

    // If admin_department, can only update milestones of their department's projects
    if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.projects.department_id) {
      return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
    }

    // Build update data with snake_case
    const updateData: any = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.dueDate !== undefined) updateData.due_date = body.dueDate ? new Date(body.dueDate).toISOString() : null;
    if (body.completedDate !== undefined) updateData.completed_date = body.completedDate ? new Date(body.completedDate).toISOString() : null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.order !== undefined) updateData.order = body.order;

    const { data: milestone, error } = await supabase
      .from("milestones")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
    }

    return c.json({ data: formatMilestone(milestone) });
  }
);

// DELETE /api/milestones/:id
milestonesRouter.delete("/milestones/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  // Get existing milestone with project
  const { data: existing, error: existingError } = await supabase
    .from("milestones")
    .select("*, projects!inner(department_id)")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return c.json({ error: { message: "Jalon non trouve", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only delete milestones of their department's projects
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== existing.projects.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", id);

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { milestonesRouter };
