import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

// Create client with service role options to bypass RLS
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

// Helper types for database tables
export type Tables = {
  users: {
    id: string;
    email: string;
    password: string;
    name: string;
    role: string;
    department_id: string | null;
    is_active: boolean;
    phone: string | null;
    must_change_password: boolean;
    created_at: string;
    updated_at: string;
  };
  departments: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    logo_url: string | null;
    created_at: string;
    updated_at: string;
  };
  sessions: {
    id: string;
    user_id: string;
    token: string;
    expires_at: string;
    created_at: string;
  };
  projects: {
    id: string;
    name: string;
    description: string | null;
    department_id: string;
    region_id: string;
    sector_id: string;
    budget: number | null;
    planned_budget: number | null;
    start_date: string | null;
    end_date: string | null;
    progress: number;
    status: string;
    responsible_name: string | null;
    responsible_phone: string | null;
    documents: string | null;
    photos: string | null;
    created_at: string;
    updated_at: string;
  };
  regions: {
    id: string;
    name: string;
    code: string;
    coordinates: string | null;
  };
  sectors: {
    id: string;
    name: string;
    description: string | null;
  };
  beneficiaries: {
    id: string;
    first_name: string;
    last_name: string;
    gender: string;
    age: number | null;
    phone: string | null;
    region_id: string;
    sector_id: string;
    project_id: string;
    accompaniment_status: string;
    created_at: string;
    updated_at: string;
  };
  news: {
    id: string;
    title: string;
    content: string;
    image_url: string | null;
    department_id: string;
    type: string;
    published_at: string;
    created_at: string;
  };
  alerts: {
    id: string;
    title: string;
    message: string;
    from_user_id: string;
    to_department_id: string | null;
    type: string;
    is_read: boolean;
    read_at: string | null;
    created_at: string;
  };
  messages: {
    id: string;
    subject: string;
    content: string;
    from_user_id: string;
    to_user_id: string | null;
    to_department_id: string | null;
    is_read: boolean;
    read_at: string | null;
    parent_id: string | null;
    attachments: string | null;
    created_at: string;
  };
  documents: {
    id: string;
    title: string;
    description: string | null;
    file_url: string;
    file_type: string;
    file_size: number;
    type: string;
    department_id: string;
    uploaded_by_id: string;
    project_id: string | null;
    is_public: boolean;
    created_at: string;
    updated_at: string;
  };
  milestones: {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    completed_date: string | null;
    status: string;
    project_id: string;
    order: number;
    created_at: string;
    updated_at: string;
  };
  disbursements: {
    id: string;
    amount: number;
    description: string | null;
    date: string;
    category: string;
    project_id: string;
    created_by_id: string;
    receipt_url: string | null;
    created_at: string;
    updated_at: string;
  };
  validation_requests: {
    id: string;
    type: string;
    status: string;
    project_id: string;
    requester_id: string;
    approver_id: string | null;
    comment: string;
    response_comment: string | null;
    metadata: string | null;
    created_at: string;
    updated_at: string;
    responded_at: string | null;
  };
  notifications: {
    id: string;
    type: string;
    title: string;
    message: string;
    user_id: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
  };
};
