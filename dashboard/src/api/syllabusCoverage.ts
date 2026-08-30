import { apiRequest } from './client';

const BASE = '/api/v1/syllabus-coverage';

/** One topic a trainer has reported as taught, with this learner's answer. */
export interface CoverageTopic {
  lesson_plan_id: string;
  topic: string;
  description: string | null;
  covered_date: string | null;
  subject_id: string;
  subject_name: string | null;
  trainer_name: string | null;
  /** null until the learner has answered. */
  my_answer: boolean | null;
  my_comment: string | null;
  answered_at: string | null;
}

export interface StudentCoverageChecklist {
  term: { id: string | null; name: string | null };
  subjects: { id: string; name: string; code: string | null }[];
  topics: CoverageTopic[];
  summary: {
    total: number;
    answered: number;
    confirmed: number;
    denied: number;
    recognised_pct: number;
  };
}

export interface CoverageValidationInput {
  lesson_plan_id: string;
  was_covered: boolean;
  comment?: string | null;
}

/**
 * `unvalidated` means the class has not answered enough to judge — kept apart
 * from `confirmed` so an administrator is never sent after a trainer whose
 * learners simply have not responded yet.
 */
export type CoverageStatus = 'flagged' | 'confirmed' | 'unvalidated';

export interface CoverageOversightRow {
  trainer_id: string;
  trainer_name: string;
  department_name: string | null;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  total_topics: number;
  covered_topics: number;
  reported_pct: number;
  /** null when no learner has answered for this pairing yet. */
  recognised_pct: number | null;
  variance: number | null;
  responses: number;
  respondents: number;
  status: CoverageStatus;
}

export interface CoverageOversightReport {
  term: { id: string | null; name: string | null };
  scope: { mode: 'all' | 'institution' | 'department' | 'trainer'; label: string };
  thresholds: { variance_flag: number; min_responses: number };
  summary: {
    pairings: number;
    flagged: number;
    unvalidated: number;
    avg_reported_pct: number;
    avg_recognised_pct: number | null;
  };
  rows: CoverageOversightRow[];
  generated_at: string;
}

export const syllabusCoverageAPI = {
  getStudentChecklist: (subjectId?: string) => {
    const qs = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : '';
    return apiRequest<StudentCoverageChecklist>(`${BASE}/student${qs}`);
  },

  submitValidations: (responses: CoverageValidationInput[]) =>
    apiRequest<{ status: string; count: number }>(`${BASE}/student`, {
      method: 'POST',
      body: { responses },
    }),

  getOversightReport: (termId?: string) => {
    const qs = termId ? `?term_id=${encodeURIComponent(termId)}` : '';
    return apiRequest<CoverageOversightReport>(`${BASE}/oversight${qs}`);
  },
};
