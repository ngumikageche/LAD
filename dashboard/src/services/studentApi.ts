import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';
const STORAGE_KEY = 'lad.session.token';

export type StudentSubject = {
  id: string;
  name: string;
  description: string | null;
  module: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  course: {
    id: string;
    name: string;
    cbet_level: string | null;
  } | null;
  trainers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    specialization: string | null;
  }>;
};

export type StudentScore = {
  id: string;
  student_id: string | null;
  subject_id: string | null;
  subject: {
    id: string;
    name: string;
  } | null;
  score: number;
  grade: string | null;
  term: string | null;
  feedback: string | null;
  is_passed: boolean | null;
  assessment: {
    id: string;
    name: string;
    type: string | null;
  } | null;
  recorded_at: string | null;
};

export type StudentNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string | null;
};

export type StudentAttendanceRecord = {
  id: string;
  // 'qr' rows are session check-ins; 'manual' rows are the trainer's roll call.
  register?: 'qr' | 'manual';
  session_id: string | null;
  session_code: string | null;
  subject_name: string | null;
  status: string;
  checked_in_at: string;
  distance_from_trainer: number | null;
};

export type StudentAttendanceResponse = {
  records: StudentAttendanceRecord[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    attendance_rate: number;
  };
};

export type StudentAnnouncement = {
  id: string;
  title: string;
  message: string;
  created_at: string | null;
  course_id: string | null;
  is_important: boolean;
  read: boolean;
};

export type StudentPerformance = {
  average_score: number;
  subject_performance: Array<{
    subject_name: string;
    average_score: number;
    scores_count: number;
  }>;
  trend: Array<{
    term: string;
    average_score: number;
    scores_count: number;
  }>;
};

export type StudentDashboardResponse = {
  average_score: number;
  enrolled_subjects_count: number;
  recent_scores: StudentScore[];
  subject_performance: Array<{ subject_name: string; average_score: number; scores_count: number }>;
  trend: Array<{ term: string; average_score: number; scores_count: number }>;
  notifications_summary: {
    unread_count: number;
    recent: StudentNotification[];
  };
  summary_panel?: {
    mastery_rate: number;
    /**
     * What `mastery_rate` was measured from. The API has always sent these two;
     * leaving them off this type is why the learner's tile showed a bare 0%
     * whether the rate was a real result or nothing measured at all.
     */
    mastery_basis?: 'competency' | 'score' | 'none';
    mastery_sample?: number;
    at_risk_students: number;
    attendance_rate: number;
    portfolio_completion_rate: number;
    portfolio_basis?: 'competency' | 'none';
    alerts: number;
  };
  /**
   * Marks with no term on them and no term on their assessment. They cannot
   * appear on `trend`, which is an axis of terms — this is how many were left
   * out, so the screen can say so instead of looking as if nothing was uploaded.
   */
  untermed_scores_count?: number;
  analytics?: any;
  last_updated?: string;
};

export type StudentProfile = {
  id: string;
  user_id: string;
  registration_number: string;
  enrollment_year: number;
  course_id: string | null;
  course: {
    id: string;
    name: string;
    cbet_level: string | null;
  } | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type StudentNotificationPage = PaginatedResponse<StudentNotification> & {
  unread_count: number;
  page_size_options?: number[];
};

export type NotificationCountSummary = {
  unread_count: number;
  total: number;
  latest_created_at: string | null;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

const studentClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

studentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const studentApi = {
  async getDashboard() {
    const response = await studentClient.get<StudentDashboardResponse>('/api/v1/student/dashboard');
    return response.data;
  },

  async getScores(params?: { subject_id?: string; term?: string; page?: number; per_page?: number }) {
    const response = await studentClient.get<PaginatedResponse<StudentScore>>('/api/v1/student/scores', { params });
    return response.data;
  },

  async getResults(params?: { subject_id?: string; term?: string; page?: number; per_page?: number }) {
    const response = await studentClient.get<PaginatedResponse<StudentScore>>('/api/v1/student/results', { params });
    return response.data;
  },

  async getSubjects() {
    const response = await studentClient.get<{ items: StudentSubject[]; total: number }>('/api/v1/student/subjects');
    return response.data;
  },

  async getAttendance() {
    const response = await studentClient.get<StudentAttendanceResponse>('/api/v1/student/attendance');
    return response.data;
  },

  async getPerformance() {
    const response = await studentClient.get<StudentPerformance>('/api/v1/student/performance');
    return response.data;
  },

  async getAnnouncements(page = 1, perPage = 10) {
    const response = await studentClient.get<PaginatedResponse<StudentAnnouncement>>('/api/v1/announcements', {
      params: { page, per_page: perPage },
    });
    return response.data;
  },

  async getNotifications(page = 1, perPage = 10) {
    const response = await studentClient.get<StudentNotificationPage>('/api/v1/student/notifications', {
      params: { page, per_page: perPage },
    });
    return response.data;
  },

  async getNotificationsSummary() {
    const response = await studentClient.get<NotificationCountSummary>('/api/v1/student/notifications/summary');
    return response.data;
  },

  async markNotificationRead(notificationId: string) {
    const response = await studentClient.put<{ message: string }>(`/api/v1/student/notifications/${notificationId}/read`);
    return response.data;
  },

  async getProfile() {
    const response = await studentClient.get<StudentProfile>('/api/v1/student/profile');
    return response.data;
  },

  async updateProfile(payload: { name: string; email: string; phone: string | null }) {
    const response = await studentClient.put<StudentProfile>('/api/v1/student/profile', payload);
    return response.data;
  },

  async changePassword(payload: { current_password: string; new_password: string; confirm_password: string }) {
    const response = await studentClient.put<{ message: string }>('/api/v1/student/change-password', payload);
    return response.data;
  },
};
