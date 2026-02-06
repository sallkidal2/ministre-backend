import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import {
  CreateValidationRequestSchema,
  ValidationRequestFiltersSchema,
  ApproveRejectValidationSchema,
  type ValidationRequestWithRelations,
  type UserRole,
} from "../types";
import { getAuthUser } from "./auth";

const validationsRouter = new Hono();

// Roles that can approve/reject validation requests with their hierarchy
const APPROVER_ROLES: UserRole[] = ["MINISTER", "PRIMATURE", "PRESIDENCY", "SUPER_ADMIN"];

// Define approval hierarchy: who can approve for whom
const APPROVAL_HIERARCHY: Record<string, UserRole[]> = {
  // Department admins submit to Minister
  "PROJECT_APPROVAL": ["MINISTER", "PRIMATURE", "PRESIDENCY", "SUPER_ADMIN"],
  "BUDGET_INCREASE": ["MINISTER", "PRIMATURE", "PRESIDENCY", "SUPER_ADMIN"],
  "STATUS_CHANGE": ["MINISTER", "PRIMATURE", "PRESIDENCY", "SUPER_ADMIN"],
  "UNBLOCK_REQUEST": ["MINISTER", "PRIMATURE", "PRESIDENCY", "SUPER_ADMIN"],
};

// Get appropriate approvers based on request type
function getApproverRolesForType(type: string): UserRole[] {
  return APPROVAL_HIERARCHY[type] || APPROVER_ROLES;
}

// Helper to format validation request from Supabase row to API response
function formatValidationRequest(v: any): ValidationRequestWithRelations {
  let metadata = null;
  if (v.metadata) {
    try {
      metadata = JSON.parse(v.metadata);
    } catch {
      metadata = v.metadata;
    }
  }

  return {
    id: v.id,
    type: v.type as ValidationRequestWithRelations["type"],
    status: v.status as ValidationRequestWithRelations["status"],
    projectId: v.project_id,
    requesterId: v.requester_id,
    approverId: v.approver_id,
    comment: v.comment,
    responseComment: v.response_comment,
    metadata,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
    respondedAt: v.responded_at ?? null,
    project: {
      id: v.projects?.id ?? "",
      name: v.projects?.name ?? "",
      status: (v.projects?.status ?? "DRAFT") as ValidationRequestWithRelations["project"]["status"],
      department: {
        id: v.projects?.departments?.id ?? "",
        name: v.projects?.departments?.name ?? "",
        code: v.projects?.departments?.code ?? "",
      },
    },
    requester: {
      id: v.requester?.id ?? "",
      name: v.requester?.name ?? "",
      email: v.requester?.email ?? "",
      role: (v.requester?.role ?? "ADMIN_DEPARTMENT") as UserRole,
    },
    approver: v.approver
      ? {
          id: v.approver.id,
          name: v.approver.name,
          email: v.approver.email,
          role: v.approver.role as UserRole,
        }
      : null,
  };
}

// Helper to create notification for approvers
async function notifyApprovers(
  validationRequest: any,
  projectName: string,
  requesterName: string
) {
  // Get appropriate approver roles based on request type
  const approverRoles = getApproverRolesForType(validationRequest.type);
  const now = new Date().toISOString();

  // Find all users with appropriate approver roles
  const { data: approvers, error } = await supabase
    .from("users")
    .select("id")
    .in("role", approverRoles)
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching approvers:", error);
    return;
  }

  // Create notifications for each approver
  if (approvers && approvers.length > 0) {
    const notifications = approvers.map((approver) => ({
      id: createId(),
      type: "VALIDATION_REQUEST",
      title: `Nouvelle demande de validation`,
      message: `${requesterName} a soumis une demande de type "${validationRequest.type}" pour le projet "${projectName}"`,
      user_id: approver.id,
      link: `/validations/${validationRequest.id}`,
      is_read: false,
      created_at: now,
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Error creating notifications:", insertError);
    }
  }
}

// Helper to notify requester of response
async function notifyRequester(
  validationRequest: any,
  projectName: string,
  approverName: string,
  approved: boolean
) {
  const now = new Date().toISOString();

  const { error } = await supabase.from("notifications").insert({
    id: createId(),
    type: "VALIDATION_RESPONSE",
    title: approved ? "Demande approuvee" : "Demande rejetee",
    message: `${approverName} a ${approved ? "approuve" : "rejete"} votre demande de type "${validationRequest.type}" pour le projet "${projectName}"`,
    user_id: validationRequest.requester_id,
    link: `/validations/${validationRequest.id}`,
    is_read: false,
    created_at: now,
  });

  if (error) {
    console.error("Error creating notification:", error);
  }
}

// GET /api/validations - List validation requests with filters
validationsRouter.get("/", zValidator("query", ValidationRequestFiltersSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const filters = c.req.valid("query");

  let query = supabase
    .from("validation_requests")
    .select(`
      *,
      projects (
        id,
        name,
        status,
        departments (id, name, code)
      ),
      requester:users!validation_requests_requester_id_fkey (id, name, email, role),
      approver:users!validation_requests_approver_id_fkey (id, name, email, role)
    `)
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.requesterId) query = query.eq("requester_id", filters.requesterId);

  // ADMIN_DEPARTMENT can only see their own requests
  if (user.role === "ADMIN_DEPARTMENT") {
    query = query.eq("requester_id", user.id);
  }

  const { data: validations, error } = await query;

  if (error) {
    console.error("Error fetching validations:", error);
    return c.json({ error: { message: "Erreur lors de la recuperation des demandes", code: "DATABASE_ERROR" } }, 500);
  }

  const data = (validations || []).map(formatValidationRequest);

  return c.json({ data });
});

// GET /api/validations/pending - Get pending requests for current user's approval level
validationsRouter.get("/pending", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only approvers can see pending requests
  if (!APPROVER_ROLES.includes(user.role)) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { data: validations, error } = await supabase
    .from("validation_requests")
    .select(`
      *,
      projects (
        id,
        name,
        status,
        departments (id, name, code)
      ),
      requester:users!validation_requests_requester_id_fkey (id, name, email, role),
      approver:users!validation_requests_approver_id_fkey (id, name, email, role)
    `)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching pending validations:", error);
    return c.json({ error: { message: "Erreur lors de la recuperation des demandes", code: "DATABASE_ERROR" } }, 500);
  }

  const data = (validations || []).map(formatValidationRequest);

  return c.json({ data });
});

// GET /api/validations/:id - Get single validation request
validationsRouter.get("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: validation, error } = await supabase
    .from("validation_requests")
    .select(`
      *,
      projects (
        id,
        name,
        status,
        departments (id, name, code)
      ),
      requester:users!validation_requests_requester_id_fkey (id, name, email, role),
      approver:users!validation_requests_approver_id_fkey (id, name, email, role)
    `)
    .eq("id", id)
    .single();

  if (error || !validation) {
    return c.json({ error: { message: "Demande de validation non trouvee", code: "NOT_FOUND" } }, 404);
  }

  // ADMIN_DEPARTMENT can only see their own requests
  if (user.role === "ADMIN_DEPARTMENT" && validation.requester_id !== user.id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  return c.json({ data: formatValidationRequest(validation) });
});

// POST /api/validations - Create new validation request
validationsRouter.post("/", zValidator("json", CreateValidationRequestSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const body = c.req.valid("json");

  // Verify project exists
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(`
      *,
      departments (id, name, code)
    `)
    .eq("id", body.projectId)
    .single();

  if (projectError || !project) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  // ADMIN_DEPARTMENT can only create requests for their department's projects
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== project.department_id) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const validationId = createId();
  const now = new Date().toISOString();

  // Create validation request
  const { data: validation, error: createError } = await supabase
    .from("validation_requests")
    .insert({
      id: validationId,
      type: body.type,
      status: "PENDING",
      project_id: body.projectId,
      requester_id: user.id,
      comment: body.comment,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      created_at: now,
      updated_at: now,
    })
    .select(`
      *,
      projects (
        id,
        name,
        status,
        departments (id, name, code)
      ),
      requester:users!validation_requests_requester_id_fkey (id, name, email, role),
      approver:users!validation_requests_approver_id_fkey (id, name, email, role)
    `)
    .single();

  if (createError || !validation) {
    console.error("Error creating validation:", createError);
    return c.json({ error: { message: "Erreur lors de la creation de la demande", code: "DATABASE_ERROR" } }, 500);
  }

  // Notify approvers
  await notifyApprovers(validation, project.name, user.name);

  return c.json({ data: formatValidationRequest(validation) }, 201);
});

// PUT /api/validations/:id/approve - Approve request
validationsRouter.put("/:id/approve", zValidator("json", ApproveRejectValidationSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only approvers can approve
  if (!APPROVER_ROLES.includes(user.role)) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  // Fetch validation with project info
  const { data: validation, error: fetchError } = await supabase
    .from("validation_requests")
    .select(`
      *,
      projects (id, name, status)
    `)
    .eq("id", id)
    .single();

  if (fetchError || !validation) {
    return c.json({ error: { message: "Demande de validation non trouvee", code: "NOT_FOUND" } }, 404);
  }

  if (validation.status !== "PENDING") {
    return c.json({ error: { message: "Cette demande a deja ete traitee", code: "ALREADY_PROCESSED" } }, 400);
  }

  const now = new Date().toISOString();

  // Apply the changes based on validation type
  if (validation.type === "PROJECT_APPROVAL") {
    // Approve the project by changing status from PENDING_VALIDATION to IN_PROGRESS
    if (validation.projects?.status === "PENDING_VALIDATION") {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ status: "IN_PROGRESS", updated_at: now })
        .eq("id", validation.project_id);

      if (updateError) {
        console.error("Error updating project status:", updateError);
      }
    }
  } else if (validation.type === "BUDGET_INCREASE" && validation.metadata) {
    const metadata = JSON.parse(validation.metadata);
    if (metadata.newBudget !== undefined) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ budget: metadata.newBudget, updated_at: now })
        .eq("id", validation.project_id);

      if (updateError) {
        console.error("Error updating project budget:", updateError);
      }
    }
  } else if (validation.type === "STATUS_CHANGE" && validation.metadata) {
    const metadata = JSON.parse(validation.metadata);
    if (metadata.newStatus) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ status: metadata.newStatus, updated_at: now })
        .eq("id", validation.project_id);

      if (updateError) {
        console.error("Error updating project status:", updateError);
      }
    }
  } else if (validation.type === "UNBLOCK_REQUEST") {
    // Unblock the project by changing status from BLOCKED to IN_PROGRESS
    if (validation.projects?.status === "BLOCKED") {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ status: "IN_PROGRESS", updated_at: now })
        .eq("id", validation.project_id);

      if (updateError) {
        console.error("Error updating project status:", updateError);
      }
    }
  }

  // Update validation request
  const { data: updatedValidation, error: updateError } = await supabase
    .from("validation_requests")
    .update({
      status: "APPROVED",
      approver_id: user.id,
      response_comment: body.responseComment,
      responded_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select(`
      *,
      projects (
        id,
        name,
        status,
        departments (id, name, code)
      ),
      requester:users!validation_requests_requester_id_fkey (id, name, email, role),
      approver:users!validation_requests_approver_id_fkey (id, name, email, role)
    `)
    .single();

  if (updateError || !updatedValidation) {
    console.error("Error updating validation:", updateError);
    return c.json({ error: { message: "Erreur lors de la mise a jour de la demande", code: "DATABASE_ERROR" } }, 500);
  }

  // Notify requester
  await notifyRequester(updatedValidation, updatedValidation.projects?.name || "", user.name, true);

  return c.json({ data: formatValidationRequest(updatedValidation) });
});

// PUT /api/validations/:id/reject - Reject request
validationsRouter.put("/:id/reject", zValidator("json", ApproveRejectValidationSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only approvers can reject
  if (!APPROVER_ROLES.includes(user.role)) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  // Fetch validation
  const { data: validation, error: fetchError } = await supabase
    .from("validation_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !validation) {
    return c.json({ error: { message: "Demande de validation non trouvee", code: "NOT_FOUND" } }, 404);
  }

  if (validation.status !== "PENDING") {
    return c.json({ error: { message: "Cette demande a deja ete traitee", code: "ALREADY_PROCESSED" } }, 400);
  }

  const now = new Date().toISOString();

  // Update validation request
  const { data: updatedValidation, error: updateError } = await supabase
    .from("validation_requests")
    .update({
      status: "REJECTED",
      approver_id: user.id,
      response_comment: body.responseComment,
      responded_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select(`
      *,
      projects (
        id,
        name,
        status,
        departments (id, name, code)
      ),
      requester:users!validation_requests_requester_id_fkey (id, name, email, role),
      approver:users!validation_requests_approver_id_fkey (id, name, email, role)
    `)
    .single();

  if (updateError || !updatedValidation) {
    console.error("Error updating validation:", updateError);
    return c.json({ error: { message: "Erreur lors de la mise a jour de la demande", code: "DATABASE_ERROR" } }, 500);
  }

  // Notify requester
  await notifyRequester(updatedValidation, updatedValidation.projects?.name || "", user.name, false);

  return c.json({ data: formatValidationRequest(updatedValidation) });
});

export { validationsRouter };
