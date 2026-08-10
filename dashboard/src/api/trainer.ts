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

/** A row on the trainer's roster. `subjects` here is a list of subject names. */
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

export interface TrainerStudentSubjectResult {
  id: string;
  name: string;
  average: number;
  assessments_count: number;
}

/**
 * One learner in full. The profile endpoint returns a row per subject with its
 * own average, unlike the roster's plain names — a difference that used to be
 * hidden behind a single shared type.
 */
export interface TrainerStudentProfile extends Omit<TrainerStudent, 'subjects'> {
  subjects: TrainerStudentSubjectResult[];
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

export interface PracticalAssessmentReport {
  id: string;
  student_id: string;
  trainer_id: string;
  /** Set when this report was copied from another build; null on the original. */
  source_report_id?: string | null;
  /** Shared by every report copied from the same build, including the original. */
  template_root_id?: string | null;
  student_name?: string | null;
  student_registration_number?: string | null;
  trainer_name?: string | null;
  institution_name: string | null;
  institution_location?: string | null;
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
    media_type: 'image' | 'video' | 'audio' | 'document';
    content_type?: string | null;
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
  competence_rating_scale?: Array<{ min: number; max: number; rating: string; short_label: string }>;
  competence_pass_mark?: number;
  released_at: string | null;
  released_by_user_id: string | null;
  released_by_name?: string | null;
  status: 'draft' | 'complete' | 'released';
  created_at: string | null;
  updated_at: string | null;
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

export type PracticalAssessmentPayload = Partial<Omit<PracticalAssessmentReport, 'id' | 'created_at' | 'updated_at'>> & {
  id?: string;
  student_id: string;
  trainer_id?: string;
};

export interface AssignPracticalAssessmentResult {
  created: PracticalAssessmentReport[];
  created_count: number;
  /** Learners left out because they already hold a copy of this report build. */
  skipped_student_ids: string[];
  skipped_student_names?: string[];
  skipped_count?: number;
  template_root_id?: string;
}

export interface TrainerStats {
  assigned_subjects: number;
  total_students: number;
  recent_scores_count: number;
  at_risk_count: number;
  avg_class_performance: number;
}

export interface StudentWrittenReport {
  id: string;
  student_id: string;
  trainer_id: string | null;
  trainer_name: string | null;
  author_user_id: string;
  author_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  report_type: 'general' | 'academic' | 'attendance' | 'behaviour' | 'support' | 'progress' | 'message';
  title: string;
  body: string;
  visibility: string;
  created_at: string | null;
  delivery_channels?: Array<'system' | 'email' | 'sms'>;
  attachments?: Array<{
    id: string;
    kind: 'handwritten_feedback' | 'supporting_document' | 'student_response';
    file_name: string;
    file_url: string;
    file_size: number;
    content_type: string;
    uploaded_by_user_id?: string;
    uploaded_by_name?: string;
    uploaded_by_role?: 'student' | 'trainer' | 'admin';
    uploaded_at?: string;
  }>;
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

  async getAllStudentsForReports(): Promise<TrainerStudent[]> {
    const response = await apiClient.get('/students');
    const rows = Array.isArray(response.data) ? (response.data as any[]) : [];
    return rows.map((student) => ({
      id: String(student.id),
      name: student.user?.name ?? 'Unnamed student',
      email: student.user?.email ?? '',
      student_id: student.registration_number ?? student.code ?? '',
      enrollment_status: 'active',
      subjects: [],
      overall_avg: 0,
      assessments_taken: 0,
      subject_averages: {},
    }));
  },

  async getStudentsBySubject(subjectId: string): Promise<TrainerStudent[]> {
    const response = await apiClient.get(
      `/trainers/students?subject_id=${subjectId}`
    );
    return response.data;
  },

  async getStudentProfile(studentId: string): Promise<TrainerStudentProfile> {
    const response = await apiClient.get(`/trainers/students/${studentId}`);
    return response.data;
  },

  async searchStudents(query: string): Promise<TrainerStudent[]> {
    const response = await apiClient.get(`/trainers/students/search?q=${query}`);
    return response.data;
  },

  async getStudentReports(studentId: string): Promise<StudentWrittenReport[]> {
    const response = await apiClient.get(`/trainers/students/${studentId}/reports`);
    return response.data as StudentWrittenReport[];
  },

  async createStudentReport(
    studentId: string,
    data: {
      title: string;
      body: string;
      report_type: StudentWrittenReport['report_type'];
      subject_id?: string;
      delivery_channels?: Array<'system' | 'email' | 'sms'>;
    }
  ): Promise<StudentWrittenReport> {
    const response = await apiClient.post(`/trainers/students/${studentId}/reports`, data);
    return response.data as StudentWrittenReport;
  },

  async uploadHandwrittenFeedback(
    studentId: string,
    reportId: string,
    file: File,
  ): Promise<StudentWrittenReport> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(
      `/trainers/students/${studentId}/reports/${reportId}/handwritten-feedback`,
      formData,
      { headers: {} },
    );
    return response.data as StudentWrittenReport;
  },

  async uploadReportAttachment(
    studentId: string,
    reportId: string,
    file: File,
  ): Promise<StudentWrittenReport> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(
      `/trainers/students/${studentId}/reports/${reportId}/attachments`,
      formData,
      { headers: {} },
    );
    return response.data as StudentWrittenReport;
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

export const trainerPracticalAssessmentsAPI = {
  async listPracticalAssessments(filters?: { student_id?: string; status?: string }): Promise<PracticalAssessmentReport[]> {
    const params = new URLSearchParams();
    if (filters?.student_id) params.append('student_id', filters.student_id);
    if (filters?.status) params.append('status', filters.status);
    const response = await apiClient.get(`/practical-assessments${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data as PracticalAssessmentReport[];
  },

  async getPracticalAssessment(reportId: string): Promise<PracticalAssessmentReport> {
    const response = await apiClient.get(`/practical-assessments/${reportId}`);
    return response.data as PracticalAssessmentReport;
  },

  async getEligibleStudentsForPracticalAssessment(reportId: string): Promise<TrainerStudent[]> {
    const response = await apiClient.get(`/practical-assessments/${reportId}/eligible-students`);
    return response.data as TrainerStudent[];
  },

  async savePracticalAssessment(payload: PracticalAssessmentPayload): Promise<PracticalAssessmentReport> {
    const body = { ...payload };
    if (body.id) {
      const response = await apiClient.put(`/practical-assessments/${body.id}`, body);
      return response.data as PracticalAssessmentReport;
    }
    const response = await apiClient.post('/practical-assessments', body);
    return response.data as PracticalAssessmentReport;
  },

  async assignPracticalAssessment(
    reportId: string,
    studentIds: string[],
  ): Promise<AssignPracticalAssessmentResult> {
    const response = await apiClient.post(`/practical-assessments/${reportId}/assign`, {
      student_ids: studentIds,
    });
    return response.data as AssignPracticalAssessmentResult;
  },

  async uploadPracticalAssessmentMedia(
    reportId: string,
    file: File,
    evidenceType?: 'oral_audio' | 'practical_evidence',
    options?: { sectionId?: string; studentVisible?: boolean },
  ): Promise<PracticalAssessmentReport> {
    const formData = new FormData();
    formData.append('file', file);
    if (evidenceType) formData.append('evidence_type', evidenceType);
    if (options?.sectionId) formData.append('section_id', options.sectionId);
    if (options?.studentVisible) formData.append('student_visible', 'true');
    const response = await apiClient.post(`/practical-assessments/${reportId}/media`, formData, {
      headers: {},
    });
    return response.data.report as PracticalAssessmentReport;
  },

  async getPracticalAssessmentMediaPreviewUrl(reportId: string, attachmentId: string): Promise<string> {
    const response = await apiClient.get<{ url: string }>(
      `/practical-assessments/${reportId}/media/${attachmentId}/preview-link`,
    );
    return response.data.url;
  },

  async releasePracticalAssessment(reportId: string): Promise<PracticalAssessmentReport> {
    const response = await apiClient.post(`/practical-assessments/${reportId}/release`);
    return response.data as PracticalAssessmentReport;
  },

  async unsendPracticalAssessment(reportId: string): Promise<PracticalAssessmentReport> {
    const response = await apiClient.post(`/practical-assessments/${reportId}/unsend`);
    return response.data as PracticalAssessmentReport;
  },

  async deletePracticalAssessment(reportId: string): Promise<void> {
    await apiClient.delete(`/practical-assessments/${reportId}`);
  },
};

export const trainerReportsAPI = {
  async generateSubjectReport(subjectId: string, template?: 'class-summary' | 'performance-trends' | 'at-risk'): Promise<SubjectReport> {
    const url = template 
      ? `/trainers/reports/subject/${subjectId}?template=${template}`
      : `/trainers/reports/subject/${subjectId}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  async getClassSummary(subjectId: string): Promise<any> {
    const response = await apiClient.get(
      `/trainers/reports/summary?subject_id=${subjectId}`
    );
    return response.data;
  },

  /** PDF is rendered in the browser; the API only serves formats it builds natively. */
  async exportResults(
    subjectId: string,
    format: 'csv' | 'xlsx'
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
  async importSyllabusTemplate(trainerId: string, subjectId: string) {
    const response = await apiClient.post(`/reports/trainer/${trainerId}/syllabus/import-template`, {
      subject_id: subjectId,
    });
    return response.data as { created: number; total_template_topics: number };
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
