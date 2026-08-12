import { apiRequest } from './client';

/**
 * Competencies and the evidence filed against them.
 *
 * These two are kept together because they describe one thing: a competency is
 * the unit a learner is measured against, and portfolio evidence is what they
 * submit to prove it. The Mastery Rate and Portfolio Completion tiles are both
 * computed from this pair.
 */

export type Competency = {
  id: string;
  module_id: string | null;
  module_name: string | null;
  name: string;
  description: string | null;
  expected_outcome: string | null;
  mastery_threshold: number;
  created_at: string | null;
  /** Present on list/create/update — what is hanging off it. */
  assessment_count?: number;
  evidence_count?: number;
};

export type CompetencyInput = {
  module_id?: string;
  name?: string;
  description?: string | null;
  expected_outcome?: string | null;
  mastery_threshold?: number;
};

export const competenciesAPI = {
  async list(moduleId?: string) {
    const qs = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : '';
    return apiRequest<{ competencies: Competency[]; total: number }>(`/competencies${qs}`);
  },
  async create(data: CompetencyInput & { module_id: string; name: string }) {
    return apiRequest<Competency>('/competencies', { method: 'POST', body: data });
  },
  async update(id: string, data: CompetencyInput) {
    return apiRequest<Competency>(`/competencies/${id}`, { method: 'PUT', body: data });
  },
  async remove(id: string) {
    return apiRequest<{ status: string; id: string }>(`/competencies/${id}`, { method: 'DELETE' });
  },
};

export type EvidenceItem = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  competency_id: string | null;
  competency_name: string | null;
  module_id: string | null;
  file_url: string;
  file_name: string | null;
  uploaded_at: string | null;
  verified_by: string | null;
  verified: boolean;
};

export type EvidenceRequirement = {
  competency_id: string;
  competency_name: string;
  module_name: string | null;
  expected_outcome: string | null;
  submitted: boolean;
};

export const portfolioEvidenceAPI = {
  /** Omit studentId to read your own; a trainer passes a learner's id. */
  async requirements(studentId?: string) {
    const qs = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
    return apiRequest<{
      student_id: string;
      items: EvidenceRequirement[];
      required_count: number;
      submitted_count: number;
    }>(`/portfolio-evidence/requirements${qs}`);
  },
  async list(studentId?: string) {
    const qs = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
    return apiRequest<{ evidence: EvidenceItem[]; total: number }>(`/portfolio-evidence${qs}`);
  },
  async upload(competencyId: string, file: File, studentId?: string) {
    // Multipart, so the body is FormData and the client leaves Content-Type to
    // the browser — it has to set the boundary itself.
    const form = new FormData();
    form.append('competency_id', competencyId);
    form.append('file', file);
    if (studentId) form.append('student_id', studentId);
    return apiRequest<EvidenceItem>('/portfolio-evidence', { method: 'POST', body: form });
  },
  async remove(id: string) {
    return apiRequest<{ status: string; id: string }>(`/portfolio-evidence/${id}`, { method: 'DELETE' });
  },
};
