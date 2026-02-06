import { Hono } from "hono";
import { supabase } from "../supabase";
import { type Notification } from "../types";
import { getAuthUser } from "./auth";

const notificationsRouter = new Hono();

// Helper to format notification
function formatNotification(n: any): Notification {
  return {
    id: n.id,
    type: n.type as Notification["type"],
    title: n.title,
    message: n.message,
    userId: n.user_id,
    isRead: n.is_read,
    link: n.link,
    createdAt: n.created_at,
  };
}

// GET /api/notifications - Get user's notifications
notificationsRouter.get("/", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data = notifications.map(formatNotification);

  return c.json({ data });
});

// GET /api/notifications/unread-count - Get unread count
notificationsRouter.get("/unread-count", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: { count: count || 0 } });
});

// PUT /api/notifications/:id/read - Mark as read
notificationsRouter.put("/:id/read", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: notification, error: fetchError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !notification) {
    return c.json({ error: { message: "Notification non trouvee", code: "NOT_FOUND" } }, 404);
  }

  // Users can only mark their own notifications as read
  if (notification.user_id !== user.id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { data: updatedNotification, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: formatNotification(updatedNotification) });
});

// PUT /api/notifications/read-all - Mark all as read
notificationsRouter.put("/read-all", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { notificationsRouter };
