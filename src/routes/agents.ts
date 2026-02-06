import { Hono } from "hono";
import { supabase } from "../supabase";
import { z } from "zod";
import type { Context } from "hono";
import bcrypt from "bcryptjs";

export const agentsRouter = new Hono();

const BCRYPT_ROUNDS = 10;

// User type for context
interface AuthUser {
  id: string;
  role: string;
  departmentId: string | null;
}

// Helper to get current user from JWT token or X-User-Email header
async function getCurrentUser(c: Context): Promise<AuthUser | null> {
  // First check X-User-Email header (for database-only auth)
  const userEmail = c.req.header("X-User-Email");
  if (userEmail) {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .single();

    if (user) {
      return {
        id: user.id,
        role: user.role,
        departmentId: user.department_id,
      };
    }
  }

  // Fallback to Authorization header
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  // First try local session lookup in Supabase
  const { data: session } = await supabase
    .from('sessions')
    .select('*, user:users(*)')
    .eq('token', token)
    .single();

  if (session && new Date(session.expires_at) >= new Date()) {
    return {
      id: session.user.id,
      role: session.user.role,
      departmentId: session.user.department_id,
    };
  }

  // If no local session found, try to decode JWT (Supabase auth tokens)
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const email = payload.email;

      if (email) {
        // Find user by email in Supabase
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (user) {
          return {
            id: user.id,
            role: user.role,
            departmentId: user.department_id,
          };
        }
      }
    } catch {
      // JWT decode failed, return null
    }
  }

  return null;
}

// Middleware to check if user can manage agents
async function requireAgentManager(c: Context, next: () => Promise<void>) {
  const user = await getCurrentUser(c);

  if (!user) {
    return c.json({ error: { message: "Non autorise" } }, 401);
  }

  const allowedRoles = ["SUPER_ADMIN", "ADMIN_DEPARTMENT", "MINISTER", "PRIMATURE", "PRESIDENCY"];
  if (!allowedRoles.includes(user.role)) {
    return c.json({ error: { message: "Acces refuse - Role insuffisant" } }, 403);
  }

  (c as Context & { authUser?: AuthUser }).authUser = user;
  await next();
}

function getAuthUser(c: Context): AuthUser {
  return (c as Context & { authUser: AuthUser }).authUser;
}

// Schema for creating an agent
const CreateAgentSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  phone: z.string().min(8, "Numero de telephone invalide"),
  departmentId: z.string().optional(),
});

// GET /api/agents - List agents for department
agentsRouter.get("/", requireAgentManager, async (c) => {
  const user = getAuthUser(c);
  const departmentId = c.req.query("departmentId");

  const isHighLevel = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);

  let query = supabase
    .from('users')
    .select('*, department:departments(id, name, code)')
    .eq('role', 'ADMIN_DEPARTMENT')
    .order('created_at', { ascending: false });

  if (departmentId) {
    query = query.eq('department_id', departmentId);
  } else if (!isHighLevel && user.departmentId) {
    query = query.eq('department_id', user.departmentId);
  }

  const { data: agents, error } = await query;

  if (error) {
    console.error('Error fetching agents:', error);
    return c.json({ error: { message: "Erreur lors du chargement des agents" } }, 500);
  }

  // Transform snake_case to camelCase
  const transformedAgents = (agents || []).map(agent => ({
    id: agent.id,
    email: agent.email,
    name: agent.name,
    role: agent.role,
    isActive: agent.is_active,
    phone: agent.phone,
    departmentId: agent.department_id,
    department: agent.department,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
  }));

  return c.json({ data: transformedAgents });
});

// POST /api/agents - Create new agent
agentsRouter.post("/", requireAgentManager, async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const validation = CreateAgentSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: { message: validation.error.issues[0]?.message || "Donnees invalides" } }, 400);
  }

  const { name, phone } = validation.data;
  let departmentId = validation.data.departmentId;

  if (!departmentId) {
    if (user.departmentId) {
      departmentId = user.departmentId;
    } else {
      return c.json({ error: { message: "Departement requis" } }, 400);
    }
  }

  // Validate department exists
  const { data: department } = await supabase
    .from('departments')
    .select('id')
    .eq('id', departmentId)
    .single();

  if (!department) {
    return c.json({ error: { message: "Departement non trouve" } }, 400);
  }

  // Check permissions
  const isHighLevel = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);
  if (!isHighLevel && user.departmentId !== departmentId) {
    return c.json({ error: { message: "Vous ne pouvez pas ajouter des agents a ce departement" } }, 403);
  }

  // Clean phone number
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");

  // Check if phone already exists
  const { data: existingPhone } = await supabase
    .from('users')
    .select('id')
    .eq('phone', cleanPhone)
    .single();

  if (existingPhone) {
    return c.json({ error: { message: "Ce numero de telephone est deja utilise" } }, 400);
  }

  // Generate email from phone
  const email = `agent_${cleanPhone}@gouv.ml`;

  // Check if email exists
  const { data: existingEmail } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingEmail) {
    return c.json({ error: { message: "Ce numero de telephone est deja utilise" } }, 400);
  }

  // Hash password using bcrypt (consistent with auth.ts)
  const defaultPassword = "1234";
  const hashedPassword = bcrypt.hashSync(defaultPassword, BCRYPT_ROUNDS);

  // Create agent
  const { data: agent, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: hashedPassword,
      name,
      role: 'ADMIN_DEPARTMENT',
      department_id: departmentId,
      phone: cleanPhone,
      is_active: true,
    })
    .select('*, department:departments(id, name, code)')
    .single();

  if (error) {
    console.error('Error creating agent:', error);
    return c.json({ error: { message: "Erreur lors de la creation de l'agent" } }, 500);
  }

  return c.json({
    data: {
      id: agent.id,
      email: agent.email,
      name: agent.name,
      role: agent.role,
      isActive: agent.is_active,
      phone: agent.phone,
      departmentId: agent.department_id,
      department: agent.department,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    }
  }, 201);
});

// DELETE /api/agents/:id
agentsRouter.delete("/:id", requireAgentManager, async (c) => {
  const user = getAuthUser(c);
  const { id } = c.req.param();

  const { data: agent } = await supabase
    .from('users')
    .select('id, role, department_id')
    .eq('id', id)
    .single();

  if (!agent) {
    return c.json({ error: { message: "Agent non trouve" } }, 404);
  }

  if (agent.role !== "ADMIN_DEPARTMENT") {
    return c.json({ error: { message: "Cet utilisateur n'est pas un agent" } }, 400);
  }

  const isHighLevel = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);
  if (!isHighLevel && user.departmentId !== agent.department_id) {
    return c.json({ error: { message: "Vous ne pouvez pas supprimer cet agent" } }, 403);
  }

  // Delete sessions first
  await supabase.from('sessions').delete().eq('user_id', id);

  // Delete agent
  const { error } = await supabase.from('users').delete().eq('id', id);

  if (error) {
    console.error('Error deleting agent:', error);
    return c.json({ error: { message: "Erreur lors de la suppression" } }, 500);
  }

  return c.json({ data: { success: true } });
});

// PATCH /api/agents/:id/toggle-active
agentsRouter.patch("/:id/toggle-active", requireAgentManager, async (c) => {
  const user = getAuthUser(c);
  const { id } = c.req.param();

  const { data: agent } = await supabase
    .from('users')
    .select('id, role, department_id, is_active')
    .eq('id', id)
    .single();

  if (!agent) {
    return c.json({ error: { message: "Agent non trouve" } }, 404);
  }

  if (agent.role !== "ADMIN_DEPARTMENT") {
    return c.json({ error: { message: "Cet utilisateur n'est pas un agent" } }, 400);
  }

  const isHighLevel = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);
  if (!isHighLevel && user.departmentId !== agent.department_id) {
    return c.json({ error: { message: "Vous ne pouvez pas modifier cet agent" } }, 403);
  }

  const { data: updatedAgent, error } = await supabase
    .from('users')
    .update({ is_active: !agent.is_active })
    .eq('id', id)
    .select('*, department:departments(id, name, code)')
    .single();

  if (error) {
    console.error('Error updating agent:', error);
    return c.json({ error: { message: "Erreur lors de la modification" } }, 500);
  }

  // If deactivating, invalidate sessions
  if (!updatedAgent.is_active) {
    await supabase.from('sessions').delete().eq('user_id', id);
  }

  return c.json({
    data: {
      id: updatedAgent.id,
      email: updatedAgent.email,
      name: updatedAgent.name,
      role: updatedAgent.role,
      isActive: updatedAgent.is_active,
      phone: updatedAgent.phone,
      departmentId: updatedAgent.department_id,
      department: updatedAgent.department,
      createdAt: updatedAgent.created_at,
      updatedAt: updatedAgent.updated_at,
    }
  });
});

// PATCH /api/agents/:id/reset-password
agentsRouter.patch("/:id/reset-password", requireAgentManager, async (c) => {
  const user = getAuthUser(c);
  const { id } = c.req.param();

  const { data: agent } = await supabase
    .from('users')
    .select('id, role, department_id')
    .eq('id', id)
    .single();

  if (!agent) {
    return c.json({ error: { message: "Agent non trouve" } }, 404);
  }

  if (agent.role !== "ADMIN_DEPARTMENT") {
    return c.json({ error: { message: "Cet utilisateur n'est pas un agent" } }, 400);
  }

  const isHighLevel = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);
  if (!isHighLevel && user.departmentId !== agent.department_id) {
    return c.json({ error: { message: "Vous ne pouvez pas modifier cet agent" } }, 403);
  }

  // Hash password using bcrypt (consistent with auth.ts)
  const defaultPassword = "1234";
  const hashedPassword = bcrypt.hashSync(defaultPassword, BCRYPT_ROUNDS);

  const { error } = await supabase
    .from('users')
    .update({
      password_hash: hashedPassword,
    })
    .eq('id', id);

  if (error) {
    console.error('Error resetting password:', error);
    return c.json({ error: { message: "Erreur lors de la reinitialisation" } }, 500);
  }

  // Invalidate all sessions
  await supabase.from('sessions').delete().eq('user_id', id);

  return c.json({ data: { success: true, message: "Mot de passe reinitialise a 1234" } });
});
