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

export interface RolePermission {
  id: string;
  role_name: string;
  permissions: any;
}

export interface Institution {
  id: string;
  name: string;
  type: string;
  location: string;
  created_at: string;
}

export interface Department {
  id: string;
  institution_id: string;
  name: string;
}

export interface Course {
  id: string;
  department_id: string;
  name: string;
  cbet_level: string;
}

export interface Module {
  id: string;
  course_id: string;
  name: string;
  description?: string;
}

export interface Competency {
  id: string;
  module_id: string;
  name: string;
  description?: string;
  expected_outcome?: string;
  mastery_threshold: number;
}

export interface Student {
  id: string;
  user_id: string;
  registration_number: string;
  course_id: string;
  enrollment_year: number;
}

export interface Trainer {
  id: string;
  user_id: string;
  department_id: string;
  specialization?: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  module_id: string;
  status: string;
}

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
}

export interface CompetencyRecord {
  id: string;
  student_id: string;
  competency_id: string;
  mastery_level: number;
  status: string;
  last_updated: string;
}

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

export interface Alert {
  id: string;
  student_id: string;
  competency_id: string;
  alert_type: string;
  message: string;
  triggered_at: string;
  resolved: boolean;
}

export interface DashboardMetric {
  id: string;
  module_id: string;
  average_score: number;
  mastery_rate: number;
  at_risk_count: number;
  last_updated: string;
}

export interface SystemLog {
  id: string;
  action: string;
  user_id: string;
  metadata: any;
  created_at: string;
}

export interface Survey {
  id: string;
  user_id: string;
  role: string;
  perceived_usefulness_score: number;
  perceived_ease_of_use_score: number;
  behavioral_intention_score: number;
  submitted_at: string;
}
