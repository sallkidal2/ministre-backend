import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import { CreateDepartmentSchema, UpdateDepartmentSchema, type Department } from "../types";
import { getAuthUser } from "./auth";

const departmentsRouter = new Hono();

// GET /api/departments
departmentsRouter.get("/", async (c) => {
  const { data: departments, error } = await supabase
    .from("departments")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Department[] = departments.map((d: any) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    description: d.description,
    logoUrl: d.logo_url,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));

  return c.json({ data });
});

// GET /api/departments/:id
departmentsRouter.get("/:id", async (c) => {
  const { id } = c.req.param();

  const { data: department, error } = await supabase
    .from("departments")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !department) {
    return c.json({ error: { message: "Departement non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Get counts for related entities
  const [projectsCount, usersCount, newsCount] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("department_id", id),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("department_id", id),
    supabase.from("news").select("id", { count: "exact", head: true }).eq("department_id", id),
  ]);

  const data = {
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    logoUrl: department.logo_url,
    createdAt: department.created_at,
    updatedAt: department.updated_at,
    _count: {
      projects: projectsCount.count || 0,
      users: usersCount.count || 0,
      news: newsCount.count || 0,
    },
  };

  return c.json({ data });
});

// POST /api/departments (super admin only)
departmentsRouter.post("/", zValidator("json", CreateDepartmentSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user || user.role !== "SUPER_ADMIN") {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");

  // Check if code already exists
  const { data: existing } = await supabase
    .from("departments")
    .select("id")
    .eq("code", body.code)
    .single();

  if (existing) {
    return c.json({ error: { message: "Ce code existe deja", code: "DUPLICATE_CODE" } }, 400);
  }

  const now = new Date().toISOString();
  const newDepartment = {
    id: createId(),
    name: body.name,
    code: body.code,
    description: body.description,
    logo_url: body.logoUrl,
    created_at: now,
    updated_at: now,
  };

  const { data: department, error } = await supabase
    .from("departments")
    .insert(newDepartment)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Department = {
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    logoUrl: department.logo_url,
    createdAt: department.created_at,
    updatedAt: department.updated_at,
  };

  return c.json({ data }, 201);
});

// PUT /api/departments/:id
departmentsRouter.put("/:id", zValidator("json", UpdateDepartmentSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_DEPARTMENT")) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  // Check if department exists
  const { data: existing, error: existingError } = await supabase
    .from("departments")
    .select("*")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return c.json({ error: { message: "Departement non trouve", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only update their own department
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Check if new code conflicts
  if (body.code && body.code !== existing.code) {
    const { data: codeExists } = await supabase
      .from("departments")
      .select("id")
      .eq("code", body.code)
      .single();

    if (codeExists) {
      return c.json({ error: { message: "Ce code existe deja", code: "DUPLICATE_CODE" } }, 400);
    }
  }

  // Build update data with snake_case
  const updateData: any = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.code !== undefined) updateData.code = body.code;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.logoUrl !== undefined) updateData.logo_url = body.logoUrl;

  const { data: department, error } = await supabase
    .from("departments")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Department = {
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    logoUrl: department.logo_url,
    createdAt: department.created_at,
    updatedAt: department.updated_at,
  };

  return c.json({ data });
});

// DELETE /api/departments/:id (super admin only)
departmentsRouter.delete("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user || user.role !== "SUPER_ADMIN") {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();

  // Check if department exists
  const { data: existing, error: existingError } = await supabase
    .from("departments")
    .select("*")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return c.json({ error: { message: "Departement non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Get counts for projects and users
  const [projectsCount, usersCount] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("department_id", id),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("department_id", id),
  ]);

  // Prevent deletion if there are associated projects or users
  if ((projectsCount.count || 0) > 0 || (usersCount.count || 0) > 0) {
    return c.json({
      error: {
        message: "Ce departement ne peut pas etre supprime car il contient des projets ou des utilisateurs",
        code: "HAS_DEPENDENCIES"
      }
    }, 400);
  }

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", id);

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { departmentsRouter };
