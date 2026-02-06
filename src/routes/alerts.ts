import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { supabase } from "../supabase";
import { CreateAlertSchema, type AlertWithRelations } from "../types";
import { getAuthUser } from "./auth";

const alertsRouter = new Hono();

function formatAlert(a: any): AlertWithRelations {
  return {
    id: a.id,
    title: a.title,
    message: a.message,
    fromUserId: a.from_user_id,
    toDepartmentId: a.to_department_id,
    type: a.type as AlertWithRelations["type"],
    isRead: a.is_read,
    readAt: a.read_at ?? null,
    createdAt: a.created_at,
    fromUser: a.from_user ? {
      id: a.from_user.id,
      name: a.from_user.name,
      email: a.from_user.email,
    } : null,
    toDepartment: a.to_department
      ? {
          id: a.to_department.id,
          name: a.to_department.name,
          code: a.to_department.code,
        }
      : null,
  };
}

// GET /api/alerts
alertsRouter.get(
  "/",
  zValidator(
    "query",
    z.object({
      departmentId: z.string().optional(),
      type: z.string().optional(),
      isRead: z.string().optional(),
    })
  ),
  async (c) => {
    const user = await getAuthUser(c);

    if (!user) {
      return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
    }

    const { departmentId, type, isRead } = c.req.valid("query");

    let query = supabase
      .from('alerts')
      .select(`
        *,
        from_user:users!alerts_from_user_id_fkey(id, name, email),
        to_department:departments(id, name, code)
      `)
      .order('created_at', { ascending: false });

    // Filter by department if admin_department
    if (user.role === "ADMIN_DEPARTMENT" && user.departmentId) {
      query = query.or(`to_department_id.eq.${user.departmentId},to_department_id.is.null`);
    } else if (departmentId) {
      query = query.or(`to_department_id.eq.${departmentId},to_department_id.is.null`);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (isRead !== undefined) {
      query = query.eq('is_read', isRead === "true");
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching alerts:', error);
      return c.json({ error: { message: "Erreur lors du chargement des alertes" } }, 500);
    }

    const data = (alerts || []).map(formatAlert);

    return c.json({ data });
  }
);

// POST /api/alerts
alertsRouter.post("/", zValidator("json", CreateAlertSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only certain roles can send alerts
  if (!["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role)) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");

  // Validate department if specified
  if (body.toDepartmentId) {
    const { data: dept, error } = await supabase
      .from('departments')
      .select('id')
      .eq('id', body.toDepartmentId)
      .single();
    if (error || !dept) {
      return c.json({ error: { message: "Departement non trouve", code: "INVALID_DEPARTMENT" } }, 400);
    }
  }

  const { data: alert, error } = await supabase
    .from('alerts')
    .insert({
      title: body.title,
      message: body.message,
      from_user_id: user.id,
      to_department_id: body.toDepartmentId || null,
      type: body.type ?? "REMINDER",
      is_read: false,
    })
    .select(`
      *,
      from_user:users!alerts_from_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .single();

  if (error) {
    console.error('Error creating alert:', error);
    return c.json({ error: { message: "Erreur lors de la creation de l'alerte" } }, 500);
  }

  return c.json({ data: formatAlert(alert) }, 201);
});

// PUT /api/alerts/:id/read
alertsRouter.put("/:id/read", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: alert, error: fetchError } = await supabase
    .from('alerts')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !alert) {
    return c.json({ error: { message: "Alerte non trouvee", code: "NOT_FOUND" } }, 404);
  }

  // Check if user can mark this alert as read
  if (
    user.role === "ADMIN_DEPARTMENT" &&
    alert.to_department_id !== null &&
    alert.to_department_id !== user.departmentId
  ) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { data: updatedAlert, error } = await supabase
    .from('alerts')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      from_user:users!alerts_from_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .single();

  if (error) {
    console.error('Error updating alert:', error);
    return c.json({ error: { message: "Erreur lors de la mise a jour" } }, 500);
  }

  return c.json({ data: formatAlert(updatedAlert) });
});

export { alertsRouter };
