import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { supabase } from "../supabase";
import {
  CreateDocumentSchema,
  UpdateDocumentSchema,
  DocumentFiltersSchema,
  type DocumentWithRelations,
} from "../types";
import { getAuthUser } from "./auth";

const documentsRouter = new Hono();

// Extended document type with validation fields
interface ExtendedDocument extends DocumentWithRelations {
  validationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  validationRequestedTo?: string | null;
  validationComment?: string | null;
  validatedBy?: { id: string; name: string; email: string } | null;
  validatedAt?: string | null;
}

function formatDocument(d: any): ExtendedDocument {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    fileUrl: d.file_url,
    fileType: d.file_type,
    fileSize: d.file_size,
    type: d.type as DocumentWithRelations["type"],
    departmentId: d.department_id,
    uploadedById: d.uploaded_by_id,
    projectId: d.project_id,
    isPublic: d.is_public,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    validationStatus: d.validation_status || null,
    validationRequestedTo: d.validation_requested_to || null,
    validationComment: d.validation_comment || null,
    validatedAt: d.validated_at || null,
    department: d.department ? {
      id: d.department.id,
      name: d.department.name,
      code: d.department.code,
    } : null,
    uploadedBy: d.uploaded_by ? {
      id: d.uploaded_by.id,
      name: d.uploaded_by.name,
      email: d.uploaded_by.email,
    } : null,
    validatedBy: d.validated_by ? {
      id: d.validated_by.id,
      name: d.validated_by.name,
      email: d.validated_by.email,
    } : null,
    project: d.project
      ? {
          id: d.project.id,
          name: d.project.name,
        }
      : null,
  };
}

// GET /api/documents - list documents
documentsRouter.get("/", zValidator("query", DocumentFiltersSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { departmentId, projectId, type, isPublic, search } = c.req.valid("query");

  let query = supabase
    .from('documents')
    .select(`
      *,
      department:departments(id, name, code),
      uploaded_by:users!documents_uploaded_by_id_fkey(id, name, email),
      project:projects(id, name)
    `)
    .order('created_at', { ascending: false });

  // Filter by visibility based on user role
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId) {
    // Department admins can see their own documents and public documents
    query = query.or(`department_id.eq.${user.departmentId},is_public.eq.true`);
  } else if (departmentId) {
    // Higher roles can filter by specific department
    query = query.eq('department_id', departmentId);
  }

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (isPublic !== undefined) {
    query = query.eq('is_public', isPublic === "true");
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data: documents, error } = await query;

  if (error) {
    console.error('Error fetching documents:', error);
    return c.json({ error: { message: "Erreur lors du chargement des documents" } }, 500);
  }

  const data = (documents || []).map(formatDocument);

  return c.json({ data });
});

// GET /api/documents/pending-validations - get documents pending validation for current user
// NOTE: This route MUST be before /:id to avoid being captured by the param route
documentsRouter.get("/pending-validations", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only high-level users can see pending validations
  const validatorRoles = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"];
  if (!validatorRoles.includes(user.role)) {
    return c.json({ data: [] });
  }

  // Try to fetch documents with validation_status
  // If the column doesn't exist in Supabase, return empty array gracefully
  try {
    let query = supabase
      .from('documents')
      .select(`
        *,
        department:departments(id, name, code),
        uploaded_by:users!documents_uploaded_by_id_fkey(id, name, email),
        project:projects(id, name)
      `)
      .eq('validation_status', 'PENDING')
      .order('created_at', { ascending: false });

    // Super admins see all, others see only their assigned validations
    if (user.role !== 'SUPER_ADMIN') {
      query = query.eq('validation_requested_to', user.id);
    }

    const { data: documents, error } = await query;

    if (error) {
      // If validation_status column doesn't exist, return empty array
      if (error.code === '42703' || error.message?.includes('does not exist')) {
        return c.json({ data: [] });
      }
      console.error('Error fetching pending validations:', error);
      return c.json({ error: { message: "Erreur lors du chargement" } }, 500);
    }

    return c.json({ data: (documents || []).map(formatDocument) });
  } catch {
    // Fallback: return empty array if any error
    return c.json({ data: [] });
  }
});

// GET /api/documents/:id - get single document
documentsRouter.get("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: document, error } = await supabase
    .from('documents')
    .select(`
      *,
      department:departments(id, name, code),
      uploaded_by:users!documents_uploaded_by_id_fkey(id, name, email),
      project:projects(id, name)
    `)
    .eq('id', id)
    .single();

  if (error || !document) {
    return c.json({ error: { message: "Document non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Check access permission
  const canAccess =
    document.is_public ||
    document.department_id === user.departmentId ||
    ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);

  if (!canAccess) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  return c.json({ data: formatDocument(document) });
});

// POST /api/documents - upload new document (metadata only)
documentsRouter.post("/", zValidator("json", CreateDocumentSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const body = c.req.valid("json");

  // Validate department
  const { data: department, error: deptError } = await supabase
    .from('departments')
    .select('id')
    .eq('id', body.departmentId)
    .single();

  if (deptError || !department) {
    return c.json({ error: { message: "Departement non trouve", code: "INVALID_DEPARTMENT" } }, 400);
  }

  // Check if user can upload to this department
  if (user.role === "ADMIN_DEPARTMENT" && user.departmentId !== body.departmentId) {
    return c.json(
      { error: { message: "Vous ne pouvez telecharger que dans votre departement", code: "FORBIDDEN" } },
      403
    );
  }

  // Validate project if specified
  if (body.projectId) {
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.projectId)
      .single();
    if (projError || !project) {
      return c.json({ error: { message: "Projet non trouve", code: "INVALID_PROJECT" } }, 400);
    }
  }

  const { data: document, error } = await supabase
    .from('documents')
    .insert({
      title: body.title,
      description: body.description || null,
      file_url: body.fileUrl,
      file_type: body.fileType,
      file_size: body.fileSize,
      type: body.type ?? "REPORT",
      department_id: body.departmentId,
      uploaded_by_id: user.id,
      project_id: body.projectId || null,
      is_public: body.isPublic ?? false,
    })
    .select(`
      *,
      department:departments(id, name, code),
      uploaded_by:users(id, name, email),
      project:projects(id, name)
    `)
    .single();

  if (error) {
    console.error('Error creating document:', error);
    return c.json({ error: { message: "Erreur lors de la creation du document" } }, 500);
  }

  return c.json({ data: formatDocument(document) }, 201);
});

// PUT /api/documents/:id - update document
documentsRouter.put("/:id", zValidator("json", UpdateDocumentSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !document) {
    return c.json({ error: { message: "Document non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Check if user can update this document
  const canUpdate =
    document.uploaded_by_id === user.id ||
    (user.role === "ADMIN_DEPARTMENT" && document.department_id === user.departmentId) ||
    ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);

  if (!canUpdate) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  // Validate project if specified
  if (body.projectId) {
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.projectId)
      .single();
    if (projError || !project) {
      return c.json({ error: { message: "Projet non trouve", code: "INVALID_PROJECT" } }, 400);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.fileUrl !== undefined) updateData.file_url = body.fileUrl;
  if (body.fileType !== undefined) updateData.file_type = body.fileType;
  if (body.fileSize !== undefined) updateData.file_size = body.fileSize;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.projectId !== undefined) updateData.project_id = body.projectId;
  if (body.isPublic !== undefined) updateData.is_public = body.isPublic;

  const { data: updatedDocument, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .select(`
      *,
      department:departments(id, name, code),
      uploaded_by:users(id, name, email),
      project:projects(id, name)
    `)
    .single();

  if (error) {
    console.error('Error updating document:', error);
    return c.json({ error: { message: "Erreur lors de la mise a jour" } }, 500);
  }

  return c.json({ data: formatDocument(updatedDocument) });
});

// DELETE /api/documents/:id - delete document
documentsRouter.delete("/:id", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !document) {
    return c.json({ error: { message: "Document non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Check if user can delete this document
  const canDelete =
    document.uploaded_by_id === user.id ||
    (user.role === "ADMIN_DEPARTMENT" && document.department_id === user.departmentId) ||
    ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"].includes(user.role);

  if (!canDelete) {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting document:', error);
    return c.json({ error: { message: "Erreur lors de la suppression" } }, 500);
  }

  return c.json({ data: { success: true } });
});

// Schema for submitting document for validation
const SubmitForValidationSchema = z.object({
  validatorUserId: z.string().uuid("ID utilisateur invalide"),
  comment: z.string().optional(),
});

// POST /api/documents/:id/submit-validation - submit document for validation
documentsRouter.post("/:id/submit-validation", zValidator("json", SubmitForValidationSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const { id } = c.req.param();
  const { validatorUserId, comment } = c.req.valid("json");

  // Check if document exists and user owns it
  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !document) {
    return c.json({ error: { message: "Document non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Only the uploader or department admin can submit for validation
  const canSubmit =
    document.uploaded_by_id === user.id ||
    (user.role === "ADMIN_DEPARTMENT" && document.department_id === user.departmentId);

  if (!canSubmit) {
    return c.json({ error: { message: "Vous ne pouvez pas soumettre ce document", code: "FORBIDDEN" } }, 403);
  }

  // Check if validator exists and has appropriate role
  const { data: validator, error: validatorError } = await supabase
    .from('users')
    .select('id, role, name')
    .eq('id', validatorUserId)
    .single();

  if (validatorError || !validator) {
    return c.json({ error: { message: "Validateur non trouve", code: "INVALID_VALIDATOR" } }, 400);
  }

  const validatorRoles = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"];
  if (!validatorRoles.includes(validator.role)) {
    return c.json({ error: { message: "Cet utilisateur ne peut pas valider des documents", code: "INVALID_VALIDATOR" } }, 400);
  }

  // Update document with validation request
  const { data: updatedDocument, error } = await supabase
    .from('documents')
    .update({
      validation_status: 'PENDING',
      validation_requested_to: validatorUserId,
      validation_comment: comment || null,
      validated_by_id: null,
      validated_at: null,
    })
    .eq('id', id)
    .select(`
      *,
      department:departments(id, name, code),
      uploaded_by:users!documents_uploaded_by_id_fkey(id, name, email),
      project:projects(id, name)
    `)
    .single();

  if (error) {
    console.error('Error submitting for validation:', error);
    return c.json({ error: { message: "Erreur lors de la soumission" } }, 500);
  }

  // Create notification for validator
  await supabase
    .from('notifications')
    .insert({
      type: 'VALIDATION_REQUEST',
      title: 'Demande de validation',
      message: `${user.name} a soumis le document "${document.title}" pour validation`,
      user_id: validatorUserId,
      is_read: false,
      link: `/documents/${id}`,
    });

  return c.json({ data: formatDocument(updatedDocument) });
});

// Schema for validation response
const ValidationResponseSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

// POST /api/documents/:id/validate - approve or reject document
documentsRouter.post("/:id/validate", zValidator("json", ValidationResponseSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only high-level users can validate
  const validatorRoles = ["SUPER_ADMIN", "MINISTER", "PRIMATURE", "PRESIDENCY"];
  if (!validatorRoles.includes(user.role)) {
    return c.json({ error: { message: "Vous n'avez pas le droit de valider des documents", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const { status, comment } = c.req.valid("json");

  // Check if document exists
  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('*, uploaded_by:users!documents_uploaded_by_id_fkey(id, name)')
    .eq('id', id)
    .single();

  if (fetchError || !document) {
    return c.json({ error: { message: "Document non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Check if document is pending validation
  if (document.validation_status !== 'PENDING') {
    return c.json({ error: { message: "Ce document n'est pas en attente de validation", code: "INVALID_STATUS" } }, 400);
  }

  // Check if this user is the requested validator (or is a super admin)
  if (document.validation_requested_to !== user.id && user.role !== 'SUPER_ADMIN') {
    return c.json({ error: { message: "Vous n'etes pas le validateur designe", code: "FORBIDDEN" } }, 403);
  }

  // Update document with validation result
  const { data: updatedDocument, error } = await supabase
    .from('documents')
    .update({
      validation_status: status,
      validation_comment: comment || document.validation_comment,
      validated_by_id: user.id,
      validated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      department:departments(id, name, code),
      uploaded_by:users!documents_uploaded_by_id_fkey(id, name, email),
      project:projects(id, name)
    `)
    .single();

  if (error) {
    console.error('Error validating document:', error);
    return c.json({ error: { message: "Erreur lors de la validation" } }, 500);
  }

  // Notify the document uploader
  const statusText = status === 'APPROVED' ? 'approuve' : 'rejete';
  await supabase
    .from('notifications')
    .insert({
      type: 'VALIDATION_RESPONSE',
      title: `Document ${statusText}`,
      message: `Votre document "${document.title}" a ete ${statusText} par ${user.name}`,
      user_id: document.uploaded_by_id,
      is_read: false,
      link: `/documents/${id}`,
    });

  return c.json({ data: formatDocument(updatedDocument) });
});

export { documentsRouter };
