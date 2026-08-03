import { apiClient } from './client';

// ── Shared shapes ────────────────────────────────────────────────────────────

export type ReportScope = 'own' | 'institution';

export interface ReportEnvelope {
  school: { name: string; location: string };
  scope: ReportScope;
  generated_at: string;
  generated_by: string;
}

// ── Practical assessments ────────────────────────────────────────────────────

export interface PracticalFilters {
  course_id?: string;
  trainer_id?: string;
  status?: string;
  outcome?: string;
  unit_code?: string;
  date_from?: string;
  date_to?: string;
}

export interface PracticalFilterOptions {
  courses: Array<{ id: string; name: string }>;
  trainers: Array<{ id: string; name: string }>;
  units: Array<{ unit_code: string; unit_of_competency: string }>;
  statuses: string[];
  outcomes: string[];
}

export interface PracticalSummaryBlock {
  total_reports: number;
  learners_assessed: number;
  units_covered: number;
  assessors: number;
  draft: number;
  complete: number;
  released: number;
  competent: number;
  borderline: number;
  not_yet_competent: number;
  incomplete: number;
  competency_rate: number;
  average_score_pct: number | null;
  highest_score_pct: number | null;
  lowest_score_pct: number | null;
}

export interface PracticalGroupStats {
  reports: number;
  learners: number;
  avg_score_pct: number | null;
  competent: number;
  competency_rate: number;
}

export interface PracticalSummaryReport extends ReportEnvelope {
  summary: PracticalSummaryBlock;
  outcome_distribution: Array<{ outcome: string; count: number; pct: number }>;
  by_unit: Array<PracticalGroupStats & { unit_code: string; unit_of_competency: string }>;
  by_assessor: Array<PracticalGroupStats & { trainer_id: string; assessor_name: string }>;
  by_course: Array<PracticalGroupStats & { course_id: string | null; course_name: string }>;
  filter_options: PracticalFilterOptions;
  applied_filters: Record<string, string | null>;
}

export interface PracticalDetailTask {
  section: string;
  number: number | null;
  prompt: string | null;
  score: number | null;
  max_score: number | null;
  remark: string | null;
}

export interface PracticalDetailRow {
  report_id: string;
  student_id: string;
  student_name: string;
  registration_number: string;
  course_id: string | null;
  course_name: string;
  trainer_id: string;
  assessor_name: string;
  unit_code: string;
  unit_of_competency: string;
  qualification: string;
  assessment_date: string | null;
  assessment_venue: string | null;
  company_name: string | null;
  status: string;
  released_at: string | null;
  total_score: number | null;
  total_max_score: number | null;
  score_percentage: number | null;
  competency_outcome: string;
  general_remarks: string | null;
  tasks: PracticalDetailTask[];
  tasks_scored: number;
  tasks_total: number;
  oral_questions_total: number;
  oral_questions_scored: number;
}

export interface PracticalDetailedReport extends ReportEnvelope {
  summary: PracticalSummaryBlock;
  rows: PracticalDetailRow[];
  row_count: number;
  total_matching: number;
  truncated: boolean;
  filter_options: PracticalFilterOptions;
  applied_filters: Record<string, string | null>;
}

// ── Exam results ─────────────────────────────────────────────────────────────

export interface ExamFilters {
  term_id?: string;
  course_id?: string;
  subject_id?: string;
  assessment_id?: string;
  assessment_type?: string;
}

export interface ExamFilterOptions {
  terms: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  assessments: Array<{ id: string; name: string; assessment_type: string }>;
  assessment_types: string[];
}

export interface ExamSummaryBlock {
  total_entries: number;
  learners_assessed: number;
  assessments_covered: number;
  subjects_covered: number;
  average_mark: number | null;
  average_pct: number | null;
  pass_rate: number;
  passed: number;
  failed: number;
  highest_mark: number | null;
  lowest_mark: number | null;
}

export interface ExamGroupStats {
  entries: number;
  learners: number;
  avg_marks: number | null;
  avg_pct: number | null;
  pass_pct: number;
  fail_pct: number;
  highest: number | null;
  lowest: number | null;
}

export interface ExamSummaryReport extends ReportEnvelope {
  summary: ExamSummaryBlock;
  by_assessment: Array<ExamGroupStats & {
    assessment_id: string | null;
    assessment_name: string;
    assessment_type: string;
    total_marks: number;
  }>;
  by_subject: Array<ExamGroupStats & { subject_id: string | null; subject_name: string }>;
  by_course: Array<ExamGroupStats & { course_id: string | null; course_name: string }>;
  grade_distribution: Array<{ grade: string; count: number; pct: number }>;
  filter_options: ExamFilterOptions;
  applied_filters: Record<string, string | null>;
}

export interface ExamDetailRow {
  score_id: string;
  student_id: string | null;
  student_name: string;
  registration_number: string;
  course_id: string | null;
  course_name: string;
  subject_id: string | null;
  subject_name: string;
  assessment_id: string | null;
  assessment_name: string;
  assessment_type: string;
  term: string;
  marks_obtained: number;
  total_marks: number;
  percentage: number | null;
  grade: string;
  outcome: 'Pass' | 'Fail';
  passed: boolean;
  trainer_name: string;
  feedback: string | null;
  recorded_at: string | null;
}

export interface ExamDetailedReport extends ReportEnvelope {
  summary: ExamSummaryBlock;
  rows: ExamDetailRow[];
  row_count: number;
  total_matching: number;
  truncated: boolean;
  filter_options: ExamFilterOptions;
  applied_filters: Record<string, string | null>;
}

// ── Client ───────────────────────────────────────────────────────────────────

const buildQuery = (filters: PracticalFilters | ExamFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  return params.size ? `?${params}` : '';
};

export const assessmentReportsAPI = {
  async getPracticalSummary(filters: PracticalFilters = {}): Promise<PracticalSummaryReport> {
    const response = await apiClient.get(`/reports/assessments/practical/summary${buildQuery(filters)}`);
    return response.data as PracticalSummaryReport;
  },

  async getPracticalDetailed(filters: PracticalFilters = {}): Promise<PracticalDetailedReport> {
    const response = await apiClient.get(`/reports/assessments/practical/detailed${buildQuery(filters)}`);
    return response.data as PracticalDetailedReport;
  },

  async getExamSummary(filters: ExamFilters = {}): Promise<ExamSummaryReport> {
    const response = await apiClient.get(`/reports/assessments/exams/summary${buildQuery(filters)}`);
    return response.data as ExamSummaryReport;
  },

  async getExamDetailed(filters: ExamFilters = {}): Promise<ExamDetailedReport> {
    const response = await apiClient.get(`/reports/assessments/exams/detailed${buildQuery(filters)}`);
    return response.data as ExamDetailedReport;
  },
};
