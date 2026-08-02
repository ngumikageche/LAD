import { apiRequest } from './client';

export type FeedbackCategory =
  | 'general'
  | 'teaching'
  | 'materials'
  | 'communication'
  | 'support'
  | 'facilities';

export const FEEDBACK_CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'teaching', label: 'Teaching & delivery' },
  { value: 'materials', label: 'Learning materials' },
  { value: 'communication', label: 'Communication' },
  { value: 'support', label: 'Learner support' },
  { value: 'facilities', label: 'Facilities & equipment' },
];

export interface FeedbackTarget {
  trainer_id: string;
  trainer_name: string;
  trainer_email: string | null;
  subject_id: string;
  subject_code: string | null;
  subject_name: string;
  already_submitted: boolean;
  my_rating: number | null;
}

export interface TrainerFeedbackItem {
  id: string;
  trainer_id: string;
  trainer_name: string | null;
  subject_id: string | null;
  subject_code: string | null;
  subject_name: string | null;
  rating: number;
  teaching_rating: number | null;
  communication_rating: number | null;
  support_rating: number | null;
  category: FeedbackCategory;
  comment: string | null;
  is_anonymous: boolean;
  status: string;
  trainer_response: string | null;
  responded_at: string | null;
  student_id: string | null;
  student_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FeedbackSummary {
  total: number;
  average_rating: number | null;
  averages: {
    teaching_rating: number | null;
    communication_rating: number | null;
    support_rating: number | null;
  };
  distribution: Record<string, number>;
  awaiting_response: number;
  by_subject: Array<{
    subject_id: string | null;
    subject_code: string | null;
    subject_name: string | null;
    count: number;
    average_rating: number | null;
  }>;
}

export interface SubmitFeedbackPayload {
  trainer_id: string;
  subject_id?: string | null;
  rating: number;
  teaching_rating?: number | null;
  communication_rating?: number | null;
  support_rating?: number | null;
  category: FeedbackCategory;
  comment?: string | null;
  is_anonymous: boolean;
}

export const trainerFeedbackAPI = {
  // ── Learner ──────────────────────────────────────────────────────────────
  async getTargets(): Promise<FeedbackTarget[]> {
    const data = await apiRequest<{ targets: FeedbackTarget[] }>('/trainer-feedback/targets');
    return data.targets ?? [];
  },

  async getMine(): Promise<TrainerFeedbackItem[]> {
    const data = await apiRequest<{ feedback: TrainerFeedbackItem[] }>('/trainer-feedback/mine');
    return data.feedback ?? [];
  },

  async submit(payload: SubmitFeedbackPayload): Promise<TrainerFeedbackItem> {
    return apiRequest<TrainerFeedbackItem>('/trainer-feedback', {
      method: 'POST',
      body: payload,
    });
  },

  async withdraw(feedbackId: string): Promise<void> {
    await apiRequest(`/trainer-feedback/${feedbackId}`, { method: 'DELETE' });
  },

  // ── Trainer / staff ──────────────────────────────────────────────────────
  async getReceived(params: { trainer_id?: string; subject_id?: string } = {}): Promise<{
    feedback: TrainerFeedbackItem[];
    can_see_identities: boolean;
  }> {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as Array<[string, string]>,
    ).toString();
    const data = await apiRequest<{ feedback: TrainerFeedbackItem[]; can_see_identities: boolean }>(
      `/trainer-feedback/received${query ? `?${query}` : ''}`,
    );
    return { feedback: data.feedback ?? [], can_see_identities: Boolean(data.can_see_identities) };
  },

  async getSummary(params: { trainer_id?: string; subject_id?: string } = {}): Promise<FeedbackSummary> {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as Array<[string, string]>,
    ).toString();
    return apiRequest<FeedbackSummary>(`/trainer-feedback/summary${query ? `?${query}` : ''}`);
  },

  async respond(feedbackId: string, response: string): Promise<TrainerFeedbackItem> {
    return apiRequest<TrainerFeedbackItem>(`/trainer-feedback/${feedbackId}/respond`, {
      method: 'POST',
      body: { response },
    });
  },

  async getTrainerDirectory(): Promise<Array<{ id: string; name: string; email: string; feedback_count: number }>> {
    const data = await apiRequest<{ trainers: Array<{ id: string; name: string; email: string; feedback_count: number }> }>(
      '/trainer-feedback/trainers',
    );
    return data.trainers ?? [];
  },
};
