// Type definitions for attendance system
export interface AttendanceSession {
  id: string;
  trainer_id: string;
  course_id: string | null;
  module_id: string | null;
  session_code: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  started_at: string;
  expires_at: string;
  status: "active" | "ended";
  regeneration_interval: number;
  seconds_until_expiry: number;
  is_active: boolean;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string | null;
  registration_number: string | null;
  latitude: number;
  longitude: number;
  checked_in_at: string;
  status: "success" | "failed_gps" | "failed_duplicate" | "failed_not_enrolled";
  distance_from_trainer: number | null;
  created_at: string;
}

export interface SessionSummary {
  session_id: string;
  status: string;
  total_submissions: number;
  successful: number;
  failed_gps: number;
  seconds_until_expiry: number;
  current_token: string;
  session_code: string;
}

export interface CheckinResponse {
  success: boolean;
  message: string;
  record?: AttendanceRecord;
}

export interface StudentLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface CreateSessionRequest {
  trainer_id?: string;
  subject_id?: string;
  course_id?: string;
  module_id?: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters?: number;
  duration_minutes?: number;
  regeneration_interval?: number;
}
