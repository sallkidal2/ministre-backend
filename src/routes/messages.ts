import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { supabase } from "../supabase";
import { CreateMessageSchema, type MessageWithRelations } from "../types";
import { getAuthUser } from "./auth";

const messagesRouter = new Hono();

function formatMessage(m: any): MessageWithRelations {
  let attachments: string[] | null = null;
  if (m.attachments) {
    if (Array.isArray(m.attachments)) {
      attachments = m.attachments;
    } else if (typeof m.attachments === 'string') {
      try {
        attachments = JSON.parse(m.attachments);
      } catch {
        attachments = null;
      }
    }
  }

  return {
    id: m.id,
    subject: m.subject,
    content: m.content,
    fromUserId: m.from_user_id,
    toUserId: m.to_user_id,
    toDepartmentId: m.to_department_id,
    isRead: m.is_read,
    readAt: m.read_at ?? null,
    parentId: m.parent_id,
    attachments,
    createdAt: m.created_at,
    fromUser: m.from_user ? {
      id: m.from_user.id,
      name: m.from_user.name,
      email: m.from_user.email,
    } : null,
    toUser: m.to_user
      ? {
          id: m.to_user.id,
          name: m.to_user.name,
          email: m.to_user.email,
        }
      : null,
    toDepartment: m.to_department
      ? {
          id: m.to_department.id,
          name: m.to_department.name,
          code: m.to_department.code,
        }
      : null,
  };
}

// GET /api/messages - inbox for current user/department
messagesRouter.get(
  "/",
  zValidator(
    "query",
    z.object({
      isRead: z.string().optional(),
      parentId: z.string().optional(),
    })
  ),
  async (c) => {
    const user = await getAuthUser(c);

    if (!user) {
      return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
    }

    const { isRead, parentId } = c.req.valid("query");

    let query = supabase
      .from('messages')
      .select(`
        *,
        from_user:users!messages_from_user_id_fkey(id, name, email),
        to_user:users!messages_to_user_id_fkey(id, name, email),
        to_department:departments(id, name, code)
      `)
      .order('created_at', { ascending: false });

    // Filter by recipient (user or department)
    if (user.departmentId) {
      query = query.or(`to_user_id.eq.${user.id},to_department_id.eq.${user.departmentId}`);
    } else {
      query = query.eq('to_user_id', user.id);
    }

    if (isRead !== undefined) {
      query = query.eq('is_read', isRead === "true");
    }

    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      // Only get top-level messages (not replies) by default
      query = query.is('parent_id', null);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      return c.json({ error: { message: "Erreur lors du chargement des messages" } }, 500);
    }

    // Get reply counts
    const messageIds = (messages || []).map(m => m.id);
    const { data: replyCounts } = await supabase
      .from('messages')
      .select('parent_id')
      .in('parent_id', messageIds);

    const replyCountMap: Record<string, number> = {};
    (replyCounts || []).forEach(r => {
      replyCountMap[r.parent_id] = (replyCountMap[r.parent_id] || 0) + 1;
    });

    const data = (messages || []).map((m) => ({
      ...formatMessage(m),
      replyCount: replyCountMap[m.id] || 0,
    }));

    return c.json({ data });
  }
);

// GET /api/messages/sent - sent messages
messagesRouter.get("/sent", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select(`
      *,
      from_user:users!messages_from_user_id_fkey(id, name, email),
      to_user:users!messages_to_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .eq('from_user_id', user.id)
    .is('parent_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching sent messages:', error);
    return c.json({ error: { message: "Erreur lors du chargement des messages" } }, 500);
  }

  // Get reply counts
  const messageIds = (messages || []).map(m => m.id);
  const { data: replyCounts } = await supabase
    .from('messages')
    .select('parent_id')
    .in('parent_id', messageIds);

  const replyCountMap: Record<string, number> = {};
  (replyCounts || []).forEach(r => {
    replyCountMap[r.parent_id] = (replyCountMap[r.parent_id] || 0) + 1;
  });

  const data = (messages || []).map((m) => ({
    ...formatMessage(m),
    replyCount: replyCountMap[m.id] || 0,
  }));

  return c.json({ data });
});

// GET /api/messages/:id - get single message with replies
messagesRouter.get("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: message, error } = await supabase
    .from('messages')
    .select(`
      *,
      from_user:users!messages_from_user_id_fkey(id, name, email),
      to_user:users!messages_to_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .eq('id', id)
    .single();

  if (error || !message) {
    return c.json({ error: { message: "Message non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Check if user can access this message
  const canAccess =
    message.from_user_id === user.id ||
    message.to_user_id === user.id ||
    (user.departmentId && message.to_department_id === user.departmentId) ||
    ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);

  if (!canAccess) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Get replies
  const { data: replies } = await supabase
    .from('messages')
    .select(`
      *,
      from_user:users!messages_from_user_id_fkey(id, name, email),
      to_user:users!messages_to_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .eq('parent_id', id)
    .order('created_at', { ascending: true });

  const formattedMessage = {
    ...formatMessage(message),
    replies: (replies || []).map(formatMessage),
  };

  return c.json({ data: formattedMessage });
});

// POST /api/messages - send new message
messagesRouter.post("/", zValidator("json", CreateMessageSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const body = c.req.valid("json");

  // Must have at least one recipient
  if (!body.toUserId && !body.toDepartmentId) {
    return c.json(
      { error: { message: "Destinataire requis (utilisateur ou departement)", code: "MISSING_RECIPIENT" } },
      400
    );
  }

  // Validate recipient user if specified
  if (body.toUserId) {
    const { data: toUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', body.toUserId)
      .single();
    if (error || !toUser) {
      return c.json({ error: { message: "Utilisateur destinataire non trouve", code: "INVALID_USER" } }, 400);
    }
  }

  // Validate recipient department if specified
  if (body.toDepartmentId) {
    const { data: toDept, error } = await supabase
      .from('departments')
      .select('id')
      .eq('id', body.toDepartmentId)
      .single();
    if (error || !toDept) {
      return c.json({ error: { message: "Departement destinataire non trouve", code: "INVALID_DEPARTMENT" } }, 400);
    }
  }

  // Validate parent message if specified (for replies)
  if (body.parentId) {
    const { data: parentMessage, error } = await supabase
      .from('messages')
      .select('id')
      .eq('id', body.parentId)
      .single();
    if (error || !parentMessage) {
      return c.json({ error: { message: "Message parent non trouve", code: "INVALID_PARENT" } }, 400);
    }
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      subject: body.subject,
      content: body.content,
      from_user_id: user.id,
      to_user_id: body.toUserId || null,
      to_department_id: body.toDepartmentId || null,
      parent_id: body.parentId || null,
      attachments: body.attachments || null,
      is_read: false,
    })
    .select(`
      *,
      from_user:users!messages_from_user_id_fkey(id, name, email),
      to_user:users!messages_to_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .single();

  if (error) {
    console.error('Error creating message:', error);
    return c.json({ error: { message: "Erreur lors de l'envoi du message" } }, 500);
  }

  return c.json({ data: formatMessage(message) }, 201);
});

// PATCH /api/messages/:id/read - mark as read
messagesRouter.patch("/:id/read", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !message) {
    return c.json({ error: { message: "Message non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Check if user can mark this message as read
  const canMarkRead =
    message.to_user_id === user.id ||
    (user.departmentId && message.to_department_id === user.departmentId);

  if (!canMarkRead) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { data: updatedMessage, error } = await supabase
    .from('messages')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      from_user:users!messages_from_user_id_fkey(id, name, email),
      to_user:users!messages_to_user_id_fkey(id, name, email),
      to_department:departments(id, name, code)
    `)
    .single();

  if (error) {
    console.error('Error marking message as read:', error);
    return c.json({ error: { message: "Erreur lors de la mise a jour" } }, 500);
  }

  return c.json({ data: formatMessage(updatedMessage) });
});

// DELETE /api/messages/:id - delete message
messagesRouter.delete("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !message) {
    return c.json({ error: { message: "Message non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Only sender or admin can delete
  const canDelete =
    message.from_user_id === user.id ||
    ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);

  if (!canDelete) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Delete all replies first
  await supabase
    .from('messages')
    .delete()
    .eq('parent_id', id);

  // Delete the message
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting message:', error);
    return c.json({ error: { message: "Erreur lors de la suppression" } }, 500);
  }

  return c.json({ data: { success: true } });
});

export { messagesRouter };
