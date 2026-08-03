import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';
const STORAGE_KEY = 'lad.session.token';

export type TrainerSubject = {
  id: string;
  name: string;
  description: string | null;
  syllabus_topics?: string[];
  module_id: string;
  module_name: string | null;
  course_id: string | null;
  course_name: string | null;
  department_id: string | null;
  department_name: string | null;
  students_count: number;
  average_score: number;
  recent_scores_count: number;
  created_at: string | null;
};

export type TrainerScore = {
  id: string;
  student_id: string | null;
  subject_id: string | null;
  assessment_id: string | null;
  trainer_id: string | null;
  term: string | null;
  score: number;
  feedback: string | null;
  is_passed: boolean | null;
  grade: string | null;
  created_at: string | null;
  student: {
    id: string;
    registration_number: string;
    name: string | null;
    email: string | null;
  } | null;
  subject: {
    id: string;
    name: string;
    module_id: string;
  } | null;
  assessment: {
    id: string;
    code: string | null;
    name: string;
    total_marks: number;
    pass_marks: number | null;
  } | null;
};

export type TrainerAssessment = {
  id: string;
  code: string | null;
  name: string;
  assessment_type: string;
  assessment_scope: string;
  total_marks: number;
  pass_marks: number | null;
  course_id: string | null;
  course_name: string | null;
  module_id?: string | null;
  module_name?: string | null;
  subject_id?: string | null;
  subject_code?: string | null;
};

export type TrainerDashboardResponse = {
  subjects_assigned: number;
  subjects: TrainerSubject[];
  total_students: number;
  average_score: number;
  pass_rate: number;
  pass_count: number;
  fail_count: number;
  recent_scores: TrainerScore[];
  summary_panel?: {
    mastery_rate: number;
    at_risk_students: number;
    attendance_rate: number;
    portfolio_completion_rate: number;
    alerts: number;
  };
  analytics?: any;
  last_updated?: string;
};

export type TrainerStudentOption = {
  id: string;
  registration_number: string;
  course_id: string | null;
  enrollment_year: number;
  name: string | null;
  email: string | null;
  subjects: string[];
};

export type AtRiskStudent = {
  student_id: string;
  student_name: string;
  student_email: string;
  average_score: number;
  scores_count: number;
  weak_subjects: string[];
};

export type PaginatedScores = {
  items: TrainerScore[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

const trainerClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

trainerClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const trainerApi = {
  async getDashboard(subjectId?: string) {
    const response = await trainerClient.get<TrainerDashboardResponse>('/api/v1/trainer/dashboard', {
      params: subjectId ? { subject_id: subjectId } : undefined,
    });
    return response.data;
  },

  async getSubjects() {
    const response = await trainerClient.get<TrainerSubject[]>('/api/v1/trainer/subjects');
    return response.data;
  },

  async getAtRiskStudents(subjectId?: string, term?: string) {
    const response = await trainerClient.get<AtRiskStudent[]>('/api/v1/trainer/at-risk-students', {
      params: {
        ...(subjectId ? { subject_id: subjectId } : {}),
        ...(term ? { term } : {}),
      },
    });
    return response.data;
  },

  async getStudents(subjectId?: string) {
    const response = await trainerClient.get<{
      items: TrainerStudentOption[];
      pagination: {
        page: number;
        per_page: number;
        total: number;
        total_pages: number;
      };
    }>('/api/v1/trainer/students', {
      params: {
        ...(subjectId ? { subject_id: subjectId } : {}),
        per_page: 100,
      },
    });
    return response.data;
  },

  async getScores(params?: { subject_id?: string; term?: string; student_id?: string; page?: number; per_page?: number }) {
    const response = await trainerClient.get<PaginatedScores>('/api/v1/scores', { params });
    return response.data;
  },

  async getAssessments(subjectId: string) {
    const response = await trainerClient.get<{ assessments: TrainerAssessment[] }>(
      '/scores/bulk-marks/assessments',
      { params: { subject_id: subjectId } },
    );
    return response.data.assessments;
  },

  async createAssessment(payload: {
    subject_id: string;
    name: string;
    assessment_type: string;
    total_marks: number;
    pass_marks: number;
  }) {
    const response = await trainerClient.post<TrainerAssessment>(
      '/scores/bulk-marks/assessments',
      payload,
    );
    return response.data;
  },

  async createScore(payload: {
    student_id: string;
    subject_id: string;
    assessment_id: string;
    score: number;
    term: string;
    feedback?: string;
    exam_copies?: File[];
  }) {
    const formData = new FormData();
    formData.append('student_id', payload.student_id);
    formData.append('subject_id', payload.subject_id);
    formData.append('assessment_id', payload.assessment_id);
    formData.append('score', String(payload.score));
    formData.append('term', payload.term);
    formData.append('assessment_scope', 'formative');
    if (payload.feedback) {
      formData.append('feedback', payload.feedback);
    }
    (payload.exam_copies ?? []).forEach((file) => formData.append('exam_copies', file));

    const response = await trainerClient.post<TrainerScore>('/api/v1/trainer/scores', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async updateFeedback(scoreId: string, feedback: string) {
    const response = await trainerClient.put<TrainerScore>(`/api/v1/scores/${scoreId}/feedback`, { feedback });
    return response.data;
  },
};
