import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { supabase } from "../supabase";
import { LoginRequestSchema, type UserWithDepartment } from "../types";
import { randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";

const authRouter = new Hono();

const BCRYPT_ROUNDS = 10;

// Secure password hashing using bcrypt
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

// Verify password against hash (supports both bcrypt and legacy SHA-256)
function verifyPassword(password: string, hash: string): boolean {
  // Check if it's a bcrypt hash (starts with $2a$, $2b$, or $2y$)
  if (hash.startsWith("$2")) {
    return bcrypt.compareSync(password, hash);
  }
  // Legacy SHA-256 support for existing users - migrate them on next login
  const crypto = require("crypto");
  const sha256Hash = crypto.createHash("sha256").update(password).digest("hex");
  return sha256Hash === hash;
}

// Migrate legacy password hash to bcrypt
async function migratePasswordIfNeeded(userId: string, password: string, currentHash: string): Promise<void> {
  // Only migrate if it's not already bcrypt
  if (!currentHash.startsWith("$2")) {
    const newHash = hashPassword(password);
    await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', userId);
  }
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// Phone login schema
const PhoneLoginSchema = z.object({
  phone: z.string().min(8, "Numero de telephone invalide"),
  password: z.string().min(4, "Mot de passe requis"),
});

// Change password schema
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(4, "Mot de passe actuel requis"),
  newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caracteres"),
});

// POST /api/auth/login
authRouter.post("/login", zValidator("json", LoginRequestSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const { data: user, error } = await supabase
    .from('users')
    .select('*, department:departments(id, name, code)')
    .eq('email', email)
    .single();

  if (error || !user || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: { message: "Email ou mot de passe incorrect", code: "INVALID_CREDENTIALS" } }, 401);
  }

  // Migrate legacy SHA-256 hash to bcrypt if needed
  await migratePasswordIfNeeded(user.id, password, user.password_hash);

  // Check if account is active
  if (!user.is_active) {
    return c.json({ error: { message: "Votre compte n'est pas encore active. Contactez l'administrateur.", code: "ACCOUNT_INACTIVE" } }, 403);
  }

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    });

  const userData: UserWithDepartment & { mustChangePassword?: boolean } = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserWithDepartment["role"],
    departmentId: user.department_id,
    isActive: user.is_active,
    phone: user.phone,
    mustChangePassword: user.must_change_password,
    department: user.department ? {
      id: user.department.id,
      name: user.department.name,
      code: user.department.code,
    } : null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };

  return c.json({
    data: {
      user: userData,
      token,
    },
  });
});

// POST /api/auth/login-phone - Login with phone number
authRouter.post("/login-phone", zValidator("json", PhoneLoginSchema), async (c) => {
  const { phone, password } = c.req.valid("json");

  // Clean phone number
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");

  const { data: user, error } = await supabase
    .from('users')
    .select('*, department:departments(id, name, code)')
    .eq('phone', cleanPhone)
    .single();

  if (error || !user) {
    return c.json({ error: { message: "Numero de telephone non trouve", code: "INVALID_CREDENTIALS" } }, 401);
  }

  // Verify password using secure comparison (supports bcrypt and legacy SHA-256)
  const passwordValid = verifyPassword(password, user.password_hash);

  if (!passwordValid) {
    return c.json({ error: { message: "Mot de passe incorrect", code: "INVALID_CREDENTIALS" } }, 401);
  }

  // Migrate legacy SHA-256 hash to bcrypt if needed
  await migratePasswordIfNeeded(user.id, password, user.password_hash);

  // Check if account is active
  if (!user.is_active) {
    return c.json({ error: { message: "Votre compte n'est pas encore active. Contactez l'administrateur.", code: "ACCOUNT_INACTIVE" } }, 403);
  }

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    });

  const userData: UserWithDepartment & { mustChangePassword?: boolean } = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserWithDepartment["role"],
    departmentId: user.department_id,
    isActive: user.is_active,
    phone: user.phone,
    mustChangePassword: user.must_change_password,
    department: user.department ? {
      id: user.department.id,
      name: user.department.name,
      code: user.department.code,
    } : null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };

  return c.json({
    data: {
      user: userData,
      token,
      mustChangePassword: user.must_change_password,
    },
  });
});

// POST /api/auth/change-password - Change password
authRouter.post("/change-password", zValidator("json", ChangePasswordSchema), async (c) => {
  const { currentPassword, newPassword } = c.req.valid("json");

  // Get current user from token or X-User-Email
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Get user with password hash
  const { data: userData, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !userData) {
    return c.json({ error: { message: "Utilisateur non trouve", code: "USER_NOT_FOUND" } }, 404);
  }

  // Verify current password using secure comparison
  const passwordValid = verifyPassword(currentPassword, userData.password_hash);

  if (!passwordValid) {
    return c.json({ error: { message: "Mot de passe actuel incorrect", code: "INVALID_PASSWORD" } }, 401);
  }

  // Hash new password
  const hashedPassword = hashPassword(newPassword);

  // Update password and remove mustChangePassword flag
  await supabase
    .from('users')
    .update({
      password_hash: hashedPassword,
      must_change_password: false,
    })
    .eq('id', user.id);

  return c.json({ data: { success: true, message: "Mot de passe modifie avec succes" } });
});

// POST /api/auth/logout
authRouter.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (token) {
    await supabase
      .from('sessions')
      .delete()
      .eq('token', token);
  }

  return c.json({ data: { success: true } });
});

// GET /api/auth/me
authRouter.get("/me", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  return c.json({ data: user });
});

// Helper middleware for protected routes - supports both X-User-Email and Bearer token
export async function getAuthUser(c: any): Promise<UserWithDepartment | null> {
  // First check X-User-Email header (for database-only auth from frontend)
  const userEmail = c.req.header("X-User-Email");
  if (userEmail) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*, department:departments(id, name, code)')
      .eq('email', userEmail)
      .single();

    if (!error && user) {
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserWithDepartment["role"],
        departmentId: user.department_id,
        isActive: user.is_active,
        phone: user.phone,
        department: user.department ? {
          id: user.department.id,
          name: user.department.name,
          code: user.department.code,
        } : null,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      };
    }
  }

  // Fallback to Authorization header with Bearer token
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  // First try local session lookup in Supabase
  const { data: session } = await supabase
    .from('sessions')
    .select('*, user:users(*, department:departments(id, name, code))')
    .eq('token', token)
    .single();

  if (session && new Date(session.expires_at) >= new Date()) {
    const user = session.user;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserWithDepartment["role"],
      departmentId: user.department_id,
      isActive: user.is_active,
      phone: user.phone,
      department: user.department ? {
        id: user.department.id,
        name: user.department.name,
        code: user.department.code,
      } : null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
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
          .select('*, department:departments(id, name, code)')
          .eq('email', email)
          .single();

        if (user) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as UserWithDepartment["role"],
            departmentId: user.department_id,
            isActive: user.is_active,
            phone: user.phone,
            department: user.department ? {
              id: user.department.id,
              name: user.department.name,
              code: user.department.code,
            } : null,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          };
        }
      }
    } catch {
      // JWT decode failed, return null
    }
  }

  return null;
}

export { authRouter, hashPassword };
