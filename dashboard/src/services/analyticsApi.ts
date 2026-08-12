import { apiClient } from '../api/client';

export type SummaryPanel = {
  mastery_rate: number;
  /** What mastery_rate was measured from: competency evidence, marks, or nothing. */
  mastery_basis?: 'competency' | 'score' | 'none';
  mastery_sample?: number;
  at_risk_students: number;
  attendance_rate: number;
  portfolio_completion_rate: number;
  /** 'none' when no competency requirement exists to submit evidence against. */
  portfolio_basis?: 'competency' | 'none';
  portfolio_sample?: number;
  alerts: number;
};

export type HeatmapCell = {
  student_id: string;
  student_name: string;
  competency_id: string;
  competency_name: string;
  score: number;
  /** False when nobody has been assessed against this competency yet. */
  assessed?: boolean;
  mastery_level: 'low' | 'medium' | 'high' | 'unassessed';
};

export type HeatmapResponse = {
  items: HeatmapCell[];
  students_count: number;
  competencies_count: number;
  last_updated: string;
};

export type ProgressPoint = {
  student_id?: string | null;
  student_name?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  date: string;
  average_score: number;
};

export type ProgressResponse = {
  items: ProgressPoint[];
  cohort_trend: Array<{ date: string; average_score: number }>;
  last_updated: string;
};

export type AttendancePerformancePoint = {
  student_id: string;
  student_name: string;
  attendance_rate: number;
  average_score: number;
};

export type AttendanceCorrelationResponse = {
  items: AttendancePerformancePoint[];
  correlation: { value: number; label: string };
  last_updated: string;
};

export type AtRiskAnalyticsResponse = {
  items: Array<{
    student_id: string;
    student_name: string;
    average_score: number;
    scores_count: number;
    attendance_rate: number;
    risk_level: string;
  }>;
  thresholds: { score: number; attendance: number };
  last_updated: string;
};

export type Recommendation = {
  recommendation_type: string;
  message: string;
};

export type PortfolioTrackingResponse = {
  items: Array<{
    student_id: string;
    student_name: string;
    required_count: number;
    submitted_count: number;
    missing_count: number;
    completion_rate: number;
  }>;
  last_updated: string;
};

export type AdvancedDashboardResponse = {
  summary_panel: SummaryPanel;
  heatmap: HeatmapResponse;
  progress: ProgressResponse;
  attendance_correlation: AttendanceCorrelationResponse;
  portfolio: PortfolioTrackingResponse;
  at_risk: AtRiskAnalyticsResponse;
  cohort_comparison: CohortComparisonResponse;
  recommendations: { items: Recommendation[]; last_updated: string };
  last_updated: string;
};

export type CohortComparisonResponse = {
  cohort_a_avg: number;
  cohort_b_avg: number;
  cohorts: Array<{
    subject_id: string;
    subject_name: string;
    average_score: number;
    students_count: number;
  }>;
  last_updated: string;
};

export const analyticsApi = {
  async getStudentDashboard() {
    const response = await apiClient.get<AdvancedDashboardResponse>('/api/v1/analytics/student-dashboard');
    return response.data;
  },

  async getTrainerDashboard() {
    const response = await apiClient.get<AdvancedDashboardResponse>('/api/v1/analytics/trainer-dashboard');
    return response.data;
  },

  async getAdminDashboard() {
    const response = await apiClient.get<AdvancedDashboardResponse>('/api/v1/analytics/admin-dashboard');
    return response.data;
  },

  async getHeatmap(params?: { subject_id?: string; student_id?: string }) {
    const search = new URLSearchParams();
    if (params?.subject_id) search.set('subject_id', params.subject_id);
    if (params?.student_id) search.set('student_id', params.student_id);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    const response = await apiClient.get<HeatmapResponse>(`/api/v1/analytics/heatmap${suffix}`);
    return response.data;
  },

  async getCohortComparison(cohortA: string, cohortB: string) {
    const response = await apiClient.get<CohortComparisonResponse>(`/api/v1/analytics/cohort-comparison?cohort_a=${cohortA}&cohort_b=${cohortB}`);
    return response.data;
  },

  async getReports(scope: 'student' | 'trainer' | 'institution', subjectId?: string) {
    const suffix = subjectId ? `&subject_id=${subjectId}` : '';
    const response = await apiClient.get(`/api/v1/reports?scope=${scope}${suffix}`);
    return response.data;
  },
};
