import { z } from "zod";

// ==================== ENUMS ====================

export const UserRoleEnum = z.enum([
  "SUPER_ADMIN",
  "ADMIN_DEPARTMENT",
  "MINISTER",
  "PRIMATURE",
  "PRESIDENCY",
  "AGENT",
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const ProjectStatusEnum = z.enum([
  "PENDING_VALIDATION",
  "IN_PROGRESS",
  "COMPLETED",
  "DELAYED",
  "SUSPENDED",
  "BLOCKED",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

export const MilestoneStatusEnum = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "DELAYED",
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusEnum>;

export const DisbursementCategoryEnum = z.enum([
  "EQUIPMENT",
  "PERSONNEL",
  "MATERIALS",
  "SERVICES",
  "OTHER",
]);
export type DisbursementCategory = z.infer<typeof DisbursementCategoryEnum>;

export const GenderEnum = z.enum(["MALE", "FEMALE"]);
export type Gender = z.infer<typeof GenderEnum>;

export const AccompanimentStatusEnum = z.enum(["ACTIVE", "COMPLETED", "SUSPENDED"]);
export type AccompanimentStatus = z.infer<typeof AccompanimentStatusEnum>;

export const NewsTypeEnum = z.enum(["ACTIVITY", "TRAINING", "PROJECT", "EVENT"]);
export type NewsType = z.infer<typeof NewsTypeEnum>;

export const AlertTypeEnum = z.enum([
  "URGENT",
  "REMINDER",
  "REPORT_REQUEST",
  "UNBLOCK_REQUEST",
]);
export type AlertType = z.infer<typeof AlertTypeEnum>;

// ==================== USER ====================

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: UserRoleEnum,
  departmentId: z.string().nullable(),
  isActive: z.boolean(),
  phone: z.string().nullable().optional(),
  mustChangePassword: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UserWithDepartmentSchema = UserSchema.extend({
  department: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    })
    .nullable(),
});
export type UserWithDepartment = z.infer<typeof UserWithDepartmentSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: UserRoleEnum,
  departmentId: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(1).optional(),
  role: UserRoleEnum.optional(),
  departmentId: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

// Schema for creating an agent with phone number
export const CreateAgentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8), // Phone number is required for agents
  departmentId: z.string(),
});
export type CreateAgent = z.infer<typeof CreateAgentSchema>;

// Schema for phone login
export const PhoneLoginSchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(4),
});
export type PhoneLogin = z.infer<typeof PhoneLoginSchema>;

// Schema for password change
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(4),
  newPassword: z.string().min(6),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

export const UserStatsSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  inactiveUsers: z.number(),
  byRole: z.record(z.string(), z.number()),
});
export type UserStats = z.infer<typeof UserStatsSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserWithDepartmentSchema,
  token: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ==================== DEPARTMENT ====================

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const CreateDepartmentSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
});
export type CreateDepartment = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
});
export type UpdateDepartment = z.infer<typeof UpdateDepartmentSchema>;

// ==================== REGION ====================

export const RegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  coordinates: z.string().nullable(),
});
export type Region = z.infer<typeof RegionSchema>;

export const CreateRegionSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  coordinates: z.string().optional(),
});
export type CreateRegion = z.infer<typeof CreateRegionSchema>;

// ==================== SECTOR ====================

export const SectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});
export type Sector = z.infer<typeof SectorSchema>;

export const CreateSectorSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateSector = z.infer<typeof CreateSectorSchema>;

// ==================== PROJECT ====================

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  departmentId: z.string(),
  regionId: z.string(),
  sectorId: z.string(),
  budget: z.number().nullable(),
  plannedBudget: z.number().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  progress: z.number().min(0).max(100),
  status: ProjectStatusEnum,
  responsibleName: z.string().nullable(),
  responsiblePhone: z.string().nullable(),
  documents: z.array(z.string()).nullable(),
  photos: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectWithRelationsSchema = ProjectSchema.extend({
  department: z.object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
  }),
  region: z.object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
  }),
  sector: z.object({
    id: z.string(),
    name: z.string(),
  }),
  _count: z
    .object({
      beneficiaries: z.number(),
    })
    .optional(),
});
export type ProjectWithRelations = z.infer<typeof ProjectWithRelationsSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Le nom du projet est requis"),
  description: z.string().optional(),
  departmentId: z.string().uuid("ID de departement invalide"),
  regionId: z.string().uuid("ID de region invalide"),
  sectorId: z.string().uuid("ID de secteur invalide"),
  budget: z.number().min(0, "Le budget doit etre positif").optional(),
  plannedBudget: z.number().min(0, "Le budget prevu doit etre positif").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  progress: z.number().min(0, "La progression doit etre entre 0 et 100").max(100, "La progression doit etre entre 0 et 100").optional(),
  status: ProjectStatusEnum.optional(),
  responsibleName: z.string().optional(),
  responsiblePhone: z.string().optional(),
  documents: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  { message: "La date de debut doit etre anterieure a la date de fin" }
);
export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  departmentId: z.string().optional(),
  regionId: z.string().optional(),
  sectorId: z.string().optional(),
  budget: z.number().optional(),
  plannedBudget: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  status: ProjectStatusEnum.optional(),
  responsibleName: z.string().optional(),
  responsiblePhone: z.string().optional(),
  documents: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
});
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;

export const ProjectFiltersSchema = z.object({
  regionId: z.string().optional(),
  departmentId: z.string().optional(),
  sectorId: z.string().optional(),
  status: ProjectStatusEnum.optional(),
  search: z.string().optional(),
});
export type ProjectFilters = z.infer<typeof ProjectFiltersSchema>;

// ==================== BENEFICIARY ====================

export const BeneficiarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  gender: GenderEnum,
  age: z.number().nullable(),
  phone: z.string().nullable(),
  regionId: z.string(),
  sectorId: z.string(),
  projectId: z.string(),
  accompanimentStatus: AccompanimentStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Beneficiary = z.infer<typeof BeneficiarySchema>;

export const BeneficiaryWithRelationsSchema = BeneficiarySchema.extend({
  region: z.object({
    id: z.string(),
    name: z.string(),
  }),
  sector: z.object({
    id: z.string(),
    name: z.string(),
  }),
  project: z.object({
    id: z.string(),
    name: z.string(),
  }),
});
export type BeneficiaryWithRelations = z.infer<typeof BeneficiaryWithRelationsSchema>;

export const CreateBeneficiarySchema = z.object({
  firstName: z.string().min(1, "Le prenom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  gender: GenderEnum,
  age: z.number().min(0, "L'age doit etre positif").max(150, "L'age doit etre valide").optional(),
  phone: z.string().min(8, "Le numero de telephone doit contenir au moins 8 caracteres").optional(),
  regionId: z.string().uuid("ID de region invalide"),
  sectorId: z.string().uuid("ID de secteur invalide"),
  projectId: z.string().uuid("ID de projet invalide"),
  accompanimentStatus: AccompanimentStatusEnum.optional(),
});
export type CreateBeneficiary = z.infer<typeof CreateBeneficiarySchema>;

export const UpdateBeneficiarySchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  gender: GenderEnum.optional(),
  age: z.number().optional(),
  phone: z.string().optional(),
  regionId: z.string().optional(),
  sectorId: z.string().optional(),
  projectId: z.string().optional(),
  accompanimentStatus: AccompanimentStatusEnum.optional(),
});
export type UpdateBeneficiary = z.infer<typeof UpdateBeneficiarySchema>;

export const BeneficiaryFiltersSchema = z.object({
  regionId: z.string().optional(),
  sectorId: z.string().optional(),
  projectId: z.string().optional(),
  gender: GenderEnum.optional(),
  accompanimentStatus: AccompanimentStatusEnum.optional(),
  search: z.string().optional(),
});
export type BeneficiaryFilters = z.infer<typeof BeneficiaryFiltersSchema>;

// ==================== NEWS ====================

export const NewsSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  imageUrl: z.string().nullable(),
  departmentId: z.string(),
  type: NewsTypeEnum,
  publishedAt: z.string(),
  createdAt: z.string(),
});
export type News = z.infer<typeof NewsSchema>;

export const NewsWithDepartmentSchema = NewsSchema.extend({
  department: z.object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
  }),
});
export type NewsWithDepartment = z.infer<typeof NewsWithDepartmentSchema>;

export const CreateNewsSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  imageUrl: z.string().optional(),
  departmentId: z.string(),
  type: NewsTypeEnum.optional(),
  publishedAt: z.string().optional(),
});
export type CreateNews = z.infer<typeof CreateNewsSchema>;

// ==================== ALERT ====================

export const AlertSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  fromUserId: z.string(),
  toDepartmentId: z.string().nullable(),
  type: AlertTypeEnum,
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const AlertWithRelationsSchema = AlertSchema.extend({
  fromUser: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  toDepartment: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    })
    .nullable(),
});
export type AlertWithRelations = z.infer<typeof AlertWithRelationsSchema>;

export const CreateAlertSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  toDepartmentId: z.string().optional(),
  type: AlertTypeEnum.optional(),
});
export type CreateAlert = z.infer<typeof CreateAlertSchema>;

// ==================== STATS ====================

export const OverviewStatsSchema = z.object({
  totalProjects: z.number(),
  totalBeneficiaries: z.number(),
  totalBudget: z.number(),
  projectsByStatus: z.object({
    PENDING_VALIDATION: z.number(),
    IN_PROGRESS: z.number(),
    COMPLETED: z.number(),
    DELAYED: z.number(),
    SUSPENDED: z.number(),
    BLOCKED: z.number(),
  }),
  beneficiariesByGender: z.object({
    MALE: z.number(),
    FEMALE: z.number(),
  }),
  averageProgress: z.number(),
});
export type OverviewStats = z.infer<typeof OverviewStatsSchema>;

export const RegionStatsSchema = z.object({
  regionId: z.string(),
  regionName: z.string(),
  regionCode: z.string(),
  projectCount: z.number(),
  beneficiaryCount: z.number(),
  totalBudget: z.number(),
  averageProgress: z.number(),
});
export type RegionStats = z.infer<typeof RegionStatsSchema>;

export const DepartmentStatsSchema = z.object({
  departmentId: z.string(),
  departmentName: z.string(),
  departmentCode: z.string(),
  projectCount: z.number(),
  beneficiaryCount: z.number(),
  totalBudget: z.number(),
  averageProgress: z.number(),
});
export type DepartmentStats = z.infer<typeof DepartmentStatsSchema>;

export const SectorStatsSchema = z.object({
  sectorId: z.string(),
  sectorName: z.string(),
  projectCount: z.number(),
  beneficiaryCount: z.number(),
  totalBudget: z.number(),
});
export type SectorStats = z.infer<typeof SectorStatsSchema>;

// ==================== ERROR ====================

export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ==================== MESSAGE ====================

export const MessageSchema = z.object({
  id: z.string(),
  subject: z.string(),
  content: z.string(),
  fromUserId: z.string(),
  toUserId: z.string().nullable(),
  toDepartmentId: z.string().nullable(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  parentId: z.string().nullable(),
  attachments: z.array(z.string()).nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageWithRelationsSchema = MessageSchema.extend({
  fromUser: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  toUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .nullable(),
  toDepartment: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    })
    .nullable(),
  replies: z.array(z.lazy(() => MessageSchema)).optional(),
});
export type MessageWithRelations = z.infer<typeof MessageWithRelationsSchema>;

export const CreateMessageSchema = z.object({
  subject: z.string().min(1),
  content: z.string().min(1),
  toUserId: z.string().optional(),
  toDepartmentId: z.string().optional(),
  parentId: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

// ==================== DOCUMENT ====================

export const DocumentTypeEnum = z.enum([
  "REPORT",
  "ACTIVITY_REPORT",
  "FINANCIAL_REPORT",
  "OTHER",
]);
export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  type: DocumentTypeEnum,
  departmentId: z.string(),
  uploadedById: z.string(),
  projectId: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const DocumentWithRelationsSchema = DocumentSchema.extend({
  department: z.object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
  }),
  uploadedBy: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
});
export type DocumentWithRelations = z.infer<typeof DocumentWithRelationsSchema>;

export const CreateDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fileUrl: z.string().url(),
  fileType: z.string().min(1),
  fileSize: z.number().min(1),
  type: DocumentTypeEnum.optional(),
  departmentId: z.string(),
  projectId: z.string().optional(),
  isPublic: z.boolean().optional(),
});
export type CreateDocument = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  fileUrl: z.string().url().optional(),
  fileType: z.string().min(1).optional(),
  fileSize: z.number().min(1).optional(),
  type: DocumentTypeEnum.optional(),
  projectId: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateDocument = z.infer<typeof UpdateDocumentSchema>;

export const DocumentFiltersSchema = z.object({
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  type: DocumentTypeEnum.optional(),
  isPublic: z.string().optional(),
  search: z.string().optional(),
});
export type DocumentFilters = z.infer<typeof DocumentFiltersSchema>;

// ==================== MILESTONE ====================

export const MilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  completedDate: z.string().nullable(),
  status: MilestoneStatusEnum,
  projectId: z.string(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const MilestoneWithProjectSchema = MilestoneSchema.extend({
  project: z.object({
    id: z.string(),
    name: z.string(),
  }),
});
export type MilestoneWithProject = z.infer<typeof MilestoneWithProjectSchema>;

export const CreateMilestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  completedDate: z.string().optional(),
  status: MilestoneStatusEnum.optional(),
  order: z.number().optional(),
});
export type CreateMilestone = z.infer<typeof CreateMilestoneSchema>;

export const UpdateMilestoneSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  status: MilestoneStatusEnum.optional(),
  order: z.number().optional(),
});
export type UpdateMilestone = z.infer<typeof UpdateMilestoneSchema>;

// ==================== DISBURSEMENT ====================

export const DisbursementSchema = z.object({
  id: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
  date: z.string(),
  category: DisbursementCategoryEnum,
  projectId: z.string(),
  createdById: z.string(),
  receiptUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Disbursement = z.infer<typeof DisbursementSchema>;

export const DisbursementWithRelationsSchema = DisbursementSchema.extend({
  project: z.object({
    id: z.string(),
    name: z.string(),
  }),
  createdBy: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
});
export type DisbursementWithRelations = z.infer<typeof DisbursementWithRelationsSchema>;

export const CreateDisbursementSchema = z.object({
  amount: z.number().min(0.01, "Le montant doit etre superieur a 0"),
  description: z.string().optional(),
  date: z.string().optional(),
  category: DisbursementCategoryEnum.optional(),
  receiptUrl: z.string().url("URL de recu invalide").optional(),
});
export type CreateDisbursement = z.infer<typeof CreateDisbursementSchema>;

export const UpdateDisbursementSchema = z.object({
  amount: z.number().min(0).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  category: DisbursementCategoryEnum.optional(),
  receiptUrl: z.string().nullable().optional(),
});
export type UpdateDisbursement = z.infer<typeof UpdateDisbursementSchema>;

// ==================== REPORTS ====================

export const ProjectsReportFiltersSchema = z.object({
  departmentId: z.string().optional(),
  regionId: z.string().optional(),
  status: ProjectStatusEnum.optional(),
});
export type ProjectsReportFilters = z.infer<typeof ProjectsReportFiltersSchema>;

// ==================== VALIDATION REQUEST ====================

export const ValidationRequestTypeEnum = z.enum([
  "PROJECT_APPROVAL",
  "BUDGET_INCREASE",
  "UNBLOCK_REQUEST",
  "STATUS_CHANGE",
]);
export type ValidationRequestType = z.infer<typeof ValidationRequestTypeEnum>;

export const ValidationRequestStatusEnum = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export type ValidationRequestStatus = z.infer<typeof ValidationRequestStatusEnum>;

export const ValidationRequestSchema = z.object({
  id: z.string(),
  type: ValidationRequestTypeEnum,
  status: ValidationRequestStatusEnum,
  projectId: z.string(),
  requesterId: z.string(),
  approverId: z.string().nullable(),
  comment: z.string(),
  responseComment: z.string().nullable(),
  metadata: z.any().nullable(), // JSON field
  createdAt: z.string(),
  updatedAt: z.string(),
  respondedAt: z.string().nullable(),
});
export type ValidationRequest = z.infer<typeof ValidationRequestSchema>;

export const ValidationRequestWithRelationsSchema = ValidationRequestSchema.extend({
  project: z.object({
    id: z.string(),
    name: z.string(),
    status: ProjectStatusEnum,
    department: z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    }),
  }),
  requester: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: UserRoleEnum,
  }),
  approver: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: UserRoleEnum,
    })
    .nullable(),
});
export type ValidationRequestWithRelations = z.infer<typeof ValidationRequestWithRelationsSchema>;

export const CreateValidationRequestSchema = z.object({
  type: ValidationRequestTypeEnum,
  projectId: z.string(),
  comment: z.string().min(1),
  metadata: z.any().optional(), // e.g., { newBudget: 50000 } or { newStatus: "IN_PROGRESS" }
});
export type CreateValidationRequest = z.infer<typeof CreateValidationRequestSchema>;

export const ValidationRequestFiltersSchema = z.object({
  status: ValidationRequestStatusEnum.optional(),
  type: ValidationRequestTypeEnum.optional(),
  projectId: z.string().optional(),
  requesterId: z.string().optional(),
});
export type ValidationRequestFilters = z.infer<typeof ValidationRequestFiltersSchema>;

export const ApproveRejectValidationSchema = z.object({
  responseComment: z.string().optional(),
});
export type ApproveRejectValidation = z.infer<typeof ApproveRejectValidationSchema>;

// ==================== NOTIFICATION ====================

export const NotificationTypeEnum = z.enum([
  "VALIDATION_REQUEST",
  "VALIDATION_RESPONSE",
  "PROJECT_ALERT",
  "SYSTEM",
  "DOSSIER_REMINDER",
  "DOSSIER_ASSIGNED",
]);
export type NotificationType = z.infer<typeof NotificationTypeEnum>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeEnum,
  title: z.string(),
  message: z.string(),
  userId: z.string(),
  isRead: z.boolean(),
  link: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const CreateNotificationSchema = z.object({
  type: NotificationTypeEnum,
  title: z.string().min(1),
  message: z.string().min(1),
  userId: z.string(),
  link: z.string().optional(),
});
export type CreateNotification = z.infer<typeof CreateNotificationSchema>;

export const UnreadCountSchema = z.object({
  count: z.number(),
});
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

// ==================== SMS ====================

export const SMSProviderEnum = z.enum(["twilio", "africas_talking", "orange", "none"]);
export type SMSProvider = z.infer<typeof SMSProviderEnum>;

export const SendSMSRequestSchema = z.object({
  to: z.string().min(1, "Numero de telephone requis"),
  message: z.string().min(1, "Message requis"),
});
export type SendSMSRequest = z.infer<typeof SendSMSRequestSchema>;

export const DossierReminderRequestSchema = z.object({
  dossierId: z.string().min(1, "ID du dossier requis"),
  phone: z.string().min(1, "Numero de telephone requis"),
  dossierTitle: z.string().min(1, "Titre du dossier requis"),
  deadline: z.string().min(1, "Date d'echeance requise"),
  progress: z.number().min(0).max(100),
});
export type DossierReminderRequest = z.infer<typeof DossierReminderRequestSchema>;

export const SMSResponseSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});
export type SMSResponse = z.infer<typeof SMSResponseSchema>;

export const SMSStatusResponseSchema = z.object({
  configured: z.boolean(),
  provider: SMSProviderEnum,
});
export type SMSStatusResponse = z.infer<typeof SMSStatusResponseSchema>;
