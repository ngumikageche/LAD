import { apiClient } from './client';

// Types
export interface TrainerSubject {
  id: string;
  subject_name: string;
  subject_code: string;
  course_id: string;
  course_name: string;
  department_id: string;
  department_name: string;
  term_id: string;
  term_name: string;
  students_count: number;
  total_assessments: number;
  avg_score: number;
}

export interface TrainerStudent {
  id: string;
  name: string;
  email: string;
  student_id: string;
  enrollment_status: string;
  subjects: string[];
  overall_avg: number;
  assessments_taken: number;
  subject_averages: Record<string, number>;
}

export interface StudentPerformance {
  student_id: string;
  student_name: string;
  subject_id: string;
  subject_name: string;
  avg_score: number;
  pass_rate: number;
  status: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
  trend: 'improving' | 'stable' | 'declining';
}

export interface AtRiskStudent {
  student_id: string;
  student_name: string;
  current_avg: number;
  trend: 'declining' | 'stable' | 'improving';
  weak_subjects: string[];
  recent_scores: number[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface SubjectReport {
  subject_id: string;
  subject_name: string;
  total_students: number;
  avg_score: number;
  pass_rate: number;
  fail_rate: number;
  highest_score: number;
  lowest_score: number;
  distribution: {
    excellent: number;
    good: number;
    average: number;
    below_average: number;
    poor: number;
  };
}

export interface ScoreEntry {
  id?: string;
  student_id: string;
  assessment_id: string;
  marks_obtained: number;
  is_passed?: boolean;
  feedback?: string;
}

export interface TrainerStats {
  assigned_subjects: number;
  total_students: number;
  recent_scores_count: number;
  at_risk_count: number;
  avg_class_performance: number;
}

// API Service Objects

export const trainerSubjectsAPI = {
  async getAssignedSubjects(): Promise<TrainerSubject[]> {
    const response = await apiClient.get('/trainers/subjects');
    return response.data;
  },

  async getSubjectDetails(subjectId: string): Promise<TrainerSubject> {
    const response = await apiClient.get(`/trainers/subjects/${subjectId}`);
    return response.data;
  },

  async getSubjectsByDepartment(departmentId: string): Promise<TrainerSubject[]> {
    const response = await apiClient.get(
      `/trainers/subjects?department_id=${departmentId}`
    );
    return response.data;
  },

  async getSubjectsByTerm(termId: string): Promise<TrainerSubject[]> {
    const response = await apiClient.get(`/trainers/subjects?term_id=${termId}`);
    return response.data;
  },
};

export const trainerStudentsAPI = {
  async getStudentsInSubjects(): Promise<TrainerStudent[]> {
    const response = await apiClient.get('/trainers/students');
    return response.data;
  },

  async getStudentsBySubject(subjectId: string): Promise<TrainerStudent[]> {
    const response = await apiClient.get(
      `/trainers/students?subject_id=${subjectId}`
    );
    return response.data;
  },

  async getStudentProfile(studentId: string): Promise<TrainerStudent> {
    const response = await apiClient.get(`/trainers/students/${studentId}`);
    return response.data;
  },

  async searchStudents(query: string): Promise<TrainerStudent[]> {
    const response = await apiClient.get(`/trainers/students/search?q=${query}`);
    return response.data;
  },
};

export const trainerPerformanceAPI = {
  async getStudentPerformanceBySubject(
    subjectId: string
  ): Promise<StudentPerformance[]> {
    const response = await apiClient.get(
      `/trainers/performance?subject_id=${subjectId}`
    );
    return response.data;
  },

  async getStudentPerformanceDetailed(
    studentId: string
  ): Promise<StudentPerformance[]> {
    const response = await apiClient.get(
      `/trainers/performance/student/${studentId}`
    );
    return response.data;
  },

  async getLowPerformers(subjectId?: string): Promise<StudentPerformance[]> {
    const url = subjectId
      ? `/trainers/performance/low-performers?subject_id=${subjectId}`
      : '/trainers/performance/low-performers';
    const response = await apiClient.get(url);
    return response.data;
  },

  async getComparisonAcrossSubjects(studentId: string): Promise<any> {
    const response = await apiClient.get(
      `/trainers/performance/comparison?student_id=${studentId}`
    );
    return response.data;
  },

  async getClassAverage(subjectId: string): Promise<number> {
    const response = await apiClient.get(
      `/trainers/performance/class-average?subject_id=${subjectId}`
    );
    return response.data.average;
  },
};

export const trainerAlertsAPI = {
  async getAtRiskStudents(subjectId?: string): Promise<AtRiskStudent[]> {
    const url = subjectId
      ? `/trainers/alerts/at-risk?subject_id=${subjectId}`
      : '/trainers/alerts/at-risk';
    const response = await apiClient.get(url);
    return response.data;
  },

  async getPerformanceTrends(
    studentId: string,
    subjectId?: string
  ): Promise<any> {
    const url = subjectId
      ? `/trainers/alerts/trends?student_id=${studentId}&subject_id=${subjectId}`
      : `/trainers/alerts/trends?student_id=${studentId}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  async getEngagementMetrics(studentId: string): Promise<any> {
    const response = await apiClient.get(
      `/trainers/alerts/engagement?student_id=${studentId}`
    );
    return response.data;
  },
};

export const trainerScoresAPI = {
  async uploadScores(scores: ScoreEntry[]): Promise<any> {
    const response = await apiClient.post('/scores/bulk', { scores });
    return response.data;
  },

  async uploadCSV(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/scores/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async addScore(scoreEntry: ScoreEntry): Promise<any> {
    const response = await apiClient.post('/scores', scoreEntry);
    return response.data;
  },

  async editScore(scoreId: string, updates: Partial<ScoreEntry>): Promise<any> {
    const response = await apiClient.put(`/scores/${scoreId}`, updates);
    return response.data;
  },

  async getScoresBySubject(
    subjectId: string,
    termId?: string
  ): Promise<ScoreEntry[]> {
    const url = termId
      ? `/trainers/scores?subject_id=${subjectId}&term_id=${termId}`
      : `/trainers/scores?subject_id=${subjectId}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  async validateScores(scores: ScoreEntry[]): Promise<any> {
    const response = await apiClient.post('/scores/validate', { scores });
    return response.data;
  },

  async provideFeedback(scoreId: string, feedback: string): Promise<any> {
    const response = await apiClient.put(`/scores/${scoreId}/feedback`, {
      feedback,
    });
    return response.data;
  },
};

export const trainerReportsAPI = {
  async generateSubjectReport(subjectId: string): Promise<SubjectReport> {
    const response = await apiClient.get(
      `/trainers/reports/subject/${subjectId}`
    );
    return response.data;
  },

  async getClassSummary(subjectId: string): Promise<any> {
    const response = await apiClient.get(
      `/trainers/reports/summary?subject_id=${subjectId}`
    );
    return response.data;
  },

  async exportResults(
    subjectId: string,
    format: 'csv' | 'pdf'
  ): Promise<Blob> {
    const response = await apiClient.get(
      `/trainers/reports/export?subject_id=${subjectId}&format=${format}`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  async getHistoricalReports(): Promise<any[]> {
    const response = await apiClient.get('/trainers/reports/history');
    return response.data;
  },
};

export const trainerReportCardsAPI = {
  async getClassPerformance(subjectId: string, termId?: string) {
    const params = termId ? `?term_id=${termId}` : '';
    const response = await apiClient.get(`/reports/trainer/subject/${subjectId}/performance${params}`);
    return response.data;
  },
  async getSyllabus(trainerId: string, subjectId?: string, termId?: string) {
    const params = new URLSearchParams();
    if (subjectId) params.append('subject_id', subjectId);
    if (termId) params.append('term_id', termId);
    const qs = params.toString() ? '?' + params.toString() : '';
    const response = await apiClient.get(`/reports/trainer/${trainerId}/syllabus${qs}`);
    return response.data;
  },
  async addSyllabusTopic(trainerId: string, data: { topic: string; subject_id: string; term_id?: string; planned_date?: string; description?: string }) {
    const response = await apiClient.post(`/reports/trainer/${trainerId}/syllabus`, data);
    return response.data;
  },
  async updateSyllabusTopic(trainerId: string, planId: string, data: { topic?: string; planned_date?: string; covered_date?: string; mark_covered?: boolean }) {
    const response = await apiClient.put(`/reports/trainer/${trainerId}/syllabus/${planId}`, data);
    return response.data;
  },
  async getTrainerAttendance(trainerId: string, termId?: string) {
    const params = termId ? `?term_id=${termId}` : '';
    const response = await apiClient.get(`/reports/trainer/${trainerId}/attendance${params}`);
    return response.data;
  },
  async logTrainerAttendance(trainerId: string, data: { date: string; status: string; term_id?: string; notes?: string }) {
    const response = await apiClient.post(`/reports/trainer/${trainerId}/attendance`, data);
    return response.data;
  },
};

export const trainerDashboardAPI = {
  async getDashboardStats(): Promise<TrainerStats> {
    const response = await apiClient.get('/trainers/dashboard/stats');
    return response.data;
  },

  async getDashboardOverview(): Promise<any> {
    const response = await apiClient.get('/trainers/dashboard');
    return response.data;
  },

  async getRecentActivity(): Promise<any[]> {
    const response = await apiClient.get('/trainers/dashboard/recent');
    return response.data;
  },
};

export const trainerAnalyticsAPI = {
  async getSmartInsights(subjectId?: string): Promise<any> {
    const url = subjectId
      ? `/trainers/analytics/insights?subject_id=${subjectId}`
      : '/trainers/analytics/insights';
    const response = await apiClient.get(url);
    return response.data;
  },

  async getComparativeAnalytics(subjectId: string): Promise<any> {
    const response = await apiClient.get(
      `/trainers/analytics/comparative?subject_id=${subjectId}`
    );
    return response.data;
  },

  async getAtRiskIdentification(): Promise<AtRiskStudent[]> {
    const response = await apiClient.get('/trainers/analytics/at-risk');
    return response.data;
  },

  async getClassPerformanceComparison(): Promise<any> {
    const response = await apiClient.get('/trainers/analytics/class-comparison');
    return response.data;
  },
};
