import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import { CreateNewsSchema, type NewsWithDepartment } from "../types";
import { getAuthUser } from "./auth";

const newsRouter = new Hono();

function formatNews(n: any, department: any): NewsWithDepartment {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    imageUrl: n.image_url,
    departmentId: n.department_id,
    type: n.type as NewsWithDepartment["type"],
    publishedAt: n.published_at,
    createdAt: n.created_at,
    department: {
      id: department.id,
      name: department.name,
      code: department.code,
    },
  };
}

// GET /api/news
newsRouter.get(
  "/",
  zValidator(
    "query",
    z.object({
      departmentId: z.string().optional(),
      type: z.string().optional(),
      limit: z.string().optional(),
    })
  ),
  async (c) => {
    const { departmentId, type, limit } = c.req.valid("query");

    let query = supabase.from("news").select("*");

    if (departmentId) query = query.eq("department_id", departmentId);
    if (type) query = query.eq("type", type);

    query = query.order("published_at", { ascending: false });

    if (limit) query = query.limit(parseInt(limit));

    const { data: news, error } = await query;

    if (error) {
      return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
    }

    // Fetch departments
    const departmentIds = [...new Set(news.map((n: any) => n.department_id))];
    const { data: departments } = await supabase
      .from("departments")
      .select("id, name, code")
      .in("id", departmentIds);

    const departmentsMap = new Map((departments || []).map((d: any) => [d.id, d]));

    const data = news.map((n: any) =>
      formatNews(n, departmentsMap.get(n.department_id) || { id: n.department_id, name: "", code: "" })
    );

    return c.json({ data });
  }
);

// GET /api/news/:id
newsRouter.get("/:id", async (c) => {
  const { id } = c.req.param();

  const { data: newsItem, error } = await supabase
    .from("news")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !newsItem) {
    return c.json({ error: { message: "Actualite non trouvee", code: "NOT_FOUND" } }, 404);
  }

  // Fetch department
  const { data: department } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("id", newsItem.department_id)
    .single();

  return c.json({
    data: formatNews(newsItem, department || { id: newsItem.department_id, name: "", code: "" }),
  });
});

// POST /api/news
newsRouter.post("/", zValidator("json", CreateNewsSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const body = c.req.valid("json");

  // Validate department
  const { data: department, error: deptError } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("id", body.departmentId)
    .single();

  if (deptError || !department) {
    return c.json({ error: { message: "Departement non trouve", code: "INVALID_DEPARTMENT" } }, 400);
  }

  // If admin_department, can only create for their department
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== body.departmentId) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const now = new Date().toISOString();
  const newNewsItem = {
    id: createId(),
    title: body.title,
    content: body.content,
    image_url: body.imageUrl,
    department_id: body.departmentId,
    type: body.type ?? "ACTIVITY",
    published_at: body.publishedAt ? new Date(body.publishedAt).toISOString() : now,
    created_at: now,
  };

  const { data: newsItem, error } = await supabase
    .from("news")
    .insert(newNewsItem)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: formatNews(newsItem, department) }, 201);
});

// DELETE /api/news/:id
newsRouter.delete("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: newsItem, error: fetchError } = await supabase
    .from("news")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !newsItem) {
    return c.json({ error: { message: "Actualite non trouvee", code: "NOT_FOUND" } }, 404);
  }

  // If admin_department, can only delete their department's news
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== newsItem.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { error } = await supabase
    .from("news")
    .delete()
    .eq("id", id);

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { newsRouter };
