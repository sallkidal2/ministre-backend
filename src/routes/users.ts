import { Hono } from "hono";
import { supabase } from "../supabase";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const usersRouter = new Hono();

const BCRYPT_ROUNDS = 10;

// Secure password hashing using bcrypt
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

// Helper to convert Supabase user to API format
function formatUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.is_active,
    phone: user.phone,
    departmentId: user.department_id,
    department: user.department ? {
      id: user.department.id,
      name: user.department.name,
      code: user.department.code,
    } : null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

// Middleware to check if user is super admin or admin (using Supabase)
async function requireAdmin(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");
  console.log('[requireAdmin] Auth header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'missing');

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { message: "Non autorise" } }, 401);
  }

  const token = authHeader.slice(7);
  console.log('[requireAdmin] Token:', token.substring(0, 10) + '...');

  // Check session in Supabase
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*, user:users(*)')
    .eq('token', token)
    .single();

  console.log('[requireAdmin] Session found:', !!session, 'Error:', sessionError?.message);

  if (sessionError || !session || new Date(session.expires_at) < new Date()) {
    return c.json({ error: { message: "Session expiree" } }, 401);
  }

  const user = session.user;
  console.log('[requireAdmin] User role:', user.role);

  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_DEPARTMENT") {
    return c.json({ error: { message: "Acces refuse - Admin requis" } }, 403);
  }

  c.set("user", user);
  await next();
}

// GET /api/users - List all users (Admin only)
usersRouter.get("/", requireAdmin, async (c) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('*, department:departments(id, name, code)')
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: { message: "Erreur lors de la recuperation des utilisateurs" } }, 500);
  }

  return c.json({ data: (users || []).map(formatUser) });
});

// GET /api/users/stats/overview - Get user statistics (must be before /:id)
usersRouter.get("/stats/overview", requireAdmin, async (c) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('role, is_active');

  if (error) {
    return c.json({ error: { message: "Erreur lors de la recuperation des statistiques" } }, 500);
  }

  const totalUsers = users?.length || 0;
  const activeUsers = users?.filter(u => u.is_active).length || 0;
  const inactiveUsers = users?.filter(u => !u.is_active).length || 0;

  const byRole: Record<string, number> = {};
  users?.forEach(u => {
    byRole[u.role] = (byRole[u.role] || 0) + 1;
  });

  return c.json({
    data: {
      totalUsers,
      activeUsers,
      inactiveUsers,
      byRole,
    },
  });
});

// GET /api/users/:id - Get user by ID
usersRouter.get("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const { data: user, error } = await supabase
    .from('users')
    .select('*, department:departments(id, name, code)')
    .eq('id', id)
    .single();

  if (error || !user) {
    return c.json({ error: { message: "Utilisateur non trouve" } }, 404);
  }

  return c.json({ data: formatUser(user) });
});

// POST /api/users - Create new user (Admin only)
const CreateUserSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Mot de passe minimum 6 caracteres"),
  name: z.string().min(1, "Nom requis"),
  role: z.enum(["SUPER_ADMIN", "ADMIN_DEPARTMENT", "MINISTER", "PRIMATURE", "PRESIDENCY", "AGENT"]),
  departmentId: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

usersRouter.post("/", requireAdmin, async (c) => {
  const body = await c.req.json();
  const validation = CreateUserSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: { message: validation.error.issues[0]?.message || "Donnees invalides" } }, 400);
  }

  const { email, password, name, role, departmentId, phone, isActive } = validation.data;

  // Check if email already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    return c.json({ error: { message: "Cet email est deja utilise" } }, 400);
  }

  // Validate departmentId if provided
  if (departmentId) {
    const { data: department } = await supabase
      .from('departments')
      .select('id')
      .eq('id', departmentId)
      .single();

    if (!department) {
      return c.json({ error: { message: "Departement non trouve" } }, 400);
    }
  }

  // Hash password
  const hashedPassword = hashPassword(password);

  // Create user
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: hashedPassword,
      name,
      role,
      department_id: departmentId || null,
      phone: phone || null,
      is_active: isActive ?? true,
    })
    .select('*, department:departments(id, name, code)')
    .single();

  if (createError) {
    console.error('Error creating user:', createError);
    return c.json({ error: { message: "Erreur lors de la creation de l'utilisateur" } }, 500);
  }

  return c.json({ data: formatUser(newUser) }, 201);
});

// PATCH /api/users/:id - Update user (Admin only)
const UpdateUserSchema = z.object({
  email: z.string().email("Email invalide").optional(),
  password: z.string().min(6, "Mot de passe minimum 6 caracteres").optional(),
  name: z.string().min(1, "Nom requis").optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN_DEPARTMENT", "MINISTER", "PRIMATURE", "PRESIDENCY", "AGENT"]).optional(),
  departmentId: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

usersRouter.patch("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const validation = UpdateUserSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: { message: validation.error.issues[0]?.message || "Donnees invalides" } }, 400);
  }

  // Check user exists
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (findError || !existingUser) {
    return c.json({ error: { message: "Utilisateur non trouve" } }, 404);
  }

  const { email, password, name, role, departmentId, phone, isActive } = validation.data;

  // Check email uniqueness if changing
  if (email && email !== existingUser.email) {
    const { data: emailExists } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (emailExists) {
      return c.json({ error: { message: "Cet email est deja utilise" } }, 400);
    }
  }

  // Validate departmentId if provided
  if (departmentId) {
    const { data: department } = await supabase
      .from('departments')
      .select('id')
      .eq('id', departmentId)
      .single();

    if (!department) {
      return c.json({ error: { message: "Departement non trouve" } }, 400);
    }
  }

  // Build update object
  const updateData: Record<string, any> = {};
  if (email !== undefined) updateData.email = email;
  if (name !== undefined) updateData.name = name;
  if (role !== undefined) updateData.role = role;
  if (departmentId !== undefined) updateData.department_id = departmentId;
  if (phone !== undefined) updateData.phone = phone;
  if (isActive !== undefined) updateData.is_active = isActive;
  if (password) {
    updateData.password_hash = hashPassword(password);
  }

  const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select('*, department:departments(id, name, code)')
    .single();

  if (updateError) {
    return c.json({ error: { message: "Erreur lors de la mise a jour" } }, 500);
  }

  return c.json({ data: formatUser(updatedUser) });
});

// PATCH /api/users/:id/activate - Activate user account
usersRouter.patch("/:id/activate", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', id)
    .single();

  if (!existingUser) {
    return c.json({ error: { message: "Utilisateur non trouve" } }, 404);
  }

  const { data: user, error } = await supabase
    .from('users')
    .update({ is_active: true })
    .eq('id', id)
    .select('*, department:departments(id, name, code)')
    .single();

  if (error) {
    return c.json({ error: { message: "Erreur lors de l'activation" } }, 500);
  }

  return c.json({ data: formatUser(user) });
});

// PATCH /api/users/:id/deactivate - Deactivate user account
usersRouter.patch("/:id/deactivate", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', id)
    .single();

  if (!existingUser) {
    return c.json({ error: { message: "Utilisateur non trouve" } }, 404);
  }

  // Prevent deactivating own account
  const currentUser = c.get("user") as { id: string } | undefined;
  if (currentUser?.id === id) {
    return c.json({ error: { message: "Vous ne pouvez pas desactiver votre propre compte" } }, 400);
  }

  const { data: user, error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', id)
    .select('*, department:departments(id, name, code)')
    .single();

  if (error) {
    return c.json({ error: { message: "Erreur lors de la desactivation" } }, 500);
  }

  // Invalidate all sessions for this user
  await supabase
    .from('sessions')
    .delete()
    .eq('user_id', id);

  return c.json({ data: formatUser(user) });
});

// DELETE /api/users/:id - Delete user (Admin only)
usersRouter.delete("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', id)
    .single();

  if (!existingUser) {
    return c.json({ error: { message: "Utilisateur non trouve" } }, 404);
  }

  // Prevent deleting own account
  const currentUser = c.get("user") as { id: string } | undefined;
  if (currentUser?.id === id) {
    return c.json({ error: { message: "Vous ne pouvez pas supprimer votre propre compte" } }, 400);
  }

  // Delete sessions first
  await supabase
    .from('sessions')
    .delete()
    .eq('user_id', id);

  // Delete user
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) {
    return c.json({ error: { message: "Erreur lors de la suppression" } }, 500);
  }

  return c.json({ data: { success: true } });
});
