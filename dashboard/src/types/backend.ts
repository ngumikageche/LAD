// Types for backend tables
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password_hash: string;
  role_id: string;
  institution_id?: string;
  created_at: string;
}

export type { User };

export interface RolePermission {
  id: string;
  role_name: string;
  permissions: any;
}

export type { RolePermission };

export interface Institution {
  id: string;
  code?: string;
  name: string;
  type: string;
  location: string;
  created_at: string;
}

export type { Institution };

export interface Department {
  id: string;
  code?: string;
  institution_id: string;
  name: string;
}

export type { Department };

export interface Course {
  id: string;
  code?: string;
  department_id: string;
  name: string;
  cbet_level: string;
}

export type { Course };

export interface Subject {
  id: string;
  code?: string;
  module_id: string;
  name: string;
  description?: string;
  module?: Module;
  trainers?: Trainer[];
}

export type { Subject };

export interface StudentSubject {
  id: string;
  student_id: string;
  subject_id: string;
  subject?: Subject;
}

export type { StudentSubject };

export interface Module {
  id: string;
  code?: string;
  course_id: string;
  name: string;
  description?: string;
}

export type { Module };

export interface Competency {
  id: string;
  module_id: string;
  name: string;
  description?: string;
  expected_outcome?: string;
  mastery_threshold: number;
}

export type { Competency };

export interface Student {
  id: string;
  code?: string;
  user_id: string;
  registration_number: string;
  course_id: string;
  enrollment_year: number;
}

export type { Student };

export interface Trainer {
  id: string;
  code?: string;
  user_id: string;
  department_id: string;
  specialization?: string;
  name?: string;
  email?: string;
  user?: User;
}

export type { Trainer };

export interface Enrollment {
  id: string;
  student_id: string;
  module_id: string;
  status: string;
}

export type { Enrollment };

export interface Assessment {
  id: string;
  student_id: string;
  trainer_id: string;
  module_id: string;
  competency_id: string;
  score: number;
  status: string;
  recorded_at: string;
  source: string;
  term?: string;
  competency?: { id: string; name: string };
  module?: { id: string; name: string };
}
export type { Assessment };

export interface PracticalAssessmentReport {
  id: string;
  student_id: string;
  trainer_id: string;
  student_name?: string | null;
  student_registration_number?: string | null;
  trainer_name?: string | null;
  institution_name: string;
  department_name: string;
  awarding_body: string;
  qualification: string;
  unit_of_competency: string;
  unit_code: string;
  period: string;
  assessment_date: string | null;
  company_name?: string | null;
  assessment_venue?: string | null;
  practical_brief?: string | null;
  general_remarks?: string | null;
  media_attachments?: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_size: number | null;
    media_type: 'image' | 'video';
    uploaded_at: string;
    uploaded_by_user_id?: string | null;
  }>;
  report_sections?: Array<{
    number: number;
    title: string | null;
    type: 'narrative' | 'checklist' | 'session' | 'oral';
    description: string | null;
    content: string | null;
    duration_hours?: number | null;
    assessment_date?: string | null;
    assessment_venue?: string | null;
    note?: string | null;
    items: Array<{
      number: number;
      prompt: string | null;
      expected_response: string | null;
      remark: string | null;
      sub_items?: string[];
      score: number | null;
      max_score?: number | null;
    }>;
  }>;
  task_1_description: string | null;
  task_2_description: string | null;
  task_3_description: string | null;
  task_4_description: string | null;
  task_1_score: number | null;
  task_2_score: number | null;
  task_3_score: number | null;
  task_4_score: number | null;
  task_1_remark: string | null;
  task_2_remark: string | null;
  task_3_remark: string | null;
  task_4_remark: string | null;
  total_score: number | null;
  total_max_score?: number | null;
  score_percentage?: number | null;
  competency_outcome: string | null;
  released_at: string | null;
  released_by_user_id: string | null;
  released_by_name?: string | null;
  status: 'draft' | 'complete' | 'released';
  created_at: string;
  updated_at: string;
  task_items?: Array<{
    number: number;
    description: string | null;
    score: number | null;
    remark: string | null;
    max_score?: number | null;
  }>;
  oral_questions?: Array<{
    number: number;
    question: string | null;
    answer_guidance: string | null;
    awarded_score: number | null;
    max_score?: number | null;
  }>;
}

export type { PracticalAssessmentReport };

export interface CompetencyRecord {
  id: string;
  student_id: string;
  competency_id: string;
  mastery_level: number;
  status: string;
  last_updated: string;
}

export type { CompetencyRecord };

export interface Attendance {
  id: string;
  student_id: string;
  module_id: string;
  date: string;
  status: string;
}

export interface PortfolioEvidence {
  id: string;
  student_id: string;
  competency_id: string;
  file_url: string;
  uploaded_at: string;
  verified_by?: string;
}

export type { PortfolioEvidence };

export interface Alert {
  id: string;
  student_id: string;
  competency_id: string;
  alert_type: string;
  message: string;
  triggered_at: string;
  resolved: boolean;
}

export type { Alert };

export interface DashboardMetric {
  id: string;
  module_id: string;
  average_score: number;
  mastery_rate: number;
  at_risk_count: number;
  last_updated: string;
}
export type { DashboardMetric };

export interface SystemLog {
  id: string;
  action: string;
  user_id: string;
  metadata: any;
  created_at: string;
}

export type { SystemLog };


export interface Survey {
  id: string;
  user_id: string;
  role: string;
  perceived_usefulness_score: number;
  perceived_ease_of_use_score: number;
  behavioral_intention_score: number;
  submitted_at: string;
}
export type { Survey };
