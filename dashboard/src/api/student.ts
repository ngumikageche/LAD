import { apiClient } from './client';

/**
 * Student Analytics API Service
 * Calls: /analytics/students/{id}/*
 */

export const studentAnalytics = {
  // Get performance summary (overall avg, stats)
  async getPerformanceSummary(studentId: string) {
    const response = await apiClient.get(
      `/analytics/students/${studentId}/performance/summary`
    );
    return response.data;
  },

  // Get performance trends over time
  async getPerformanceTrends(studentId: string) {
    const response = await apiClient.get(
      `/analytics/students/${studentId}/performance/trends`
    );
    return response.data;
  },

  // Get weak subjects (poor performance areas)
  async getWeakSubjects(studentId: string) {
    const response = await apiClient.get(
      `/analytics/students/${studentId}/performance/weak-subjects`
    );
    return response.data;
  },

  // Get complete dashboard data
  async getDashboard(studentId: string) {
    const response = await apiClient.get(
      `/analytics/students/${studentId}/dashboard`
    );
    return response.data;
  },
};

/**
 * Scores API Service
 * Calls: /scores
 */

export const scoresAPI = {
  // Get all scores (optionally filtered)
  async listScores(filters?: {
    course_id?: string;
    assessment_id?: string;
    term_id?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.course_id) params.append('course_id', filters.course_id);
    if (filters?.assessment_id) params.append('assessment_id', filters.assessment_id);
    if (filters?.term_id) params.append('term_id', filters.term_id);

    const response = await apiClient.get(
      `/scores${params.toString() ? '?' + params.toString() : ''}`
    );
    return response.data;
  },

  // Get specific score
  async getScore(scoreId: string) {
    const response = await apiClient.get(`/scores/${scoreId}`);
    return response.data;
  },

  // Get feedback for score
  async getScoreFeedback(scoreId: string) {
    const response = await apiClient.get(`/scores/${scoreId}/feedback`);
    return response.data;
  },
};

/**
 * Announcements API Service
 * Calls: /announcements
 */

export const announcementsAPI = {
  // Get all announcements
  async listAnnouncements(filters?: { importance?: string }) {
    const params = new URLSearchParams();
    if (filters?.importance) params.append('importance', filters.importance);

    const response = await apiClient.get(
      `/announcements${params.toString() ? '?' + params.toString() : ''}`
    );
    return response.data;
  },

  // Get announcements for specific student (filtered by courses)
  async getStudentAnnouncements(studentId: string) {
    const response = await apiClient.get(`/announcements/students/${studentId}`);
    return response.data;
  },

  // Get specific announcement
  async getAnnouncement(announcementId: string) {
    const response = await apiClient.get(`/announcements/${announcementId}`);
    return response.data;
  },

  // Mark announcement as read
  async markAsRead(announcementId: string) {
    const response = await apiClient.post(
      `/announcements/${announcementId}/mark-read`
    );
    return response.data;
  },
};

/**
 * Profile/User API Service
 * Calls: /auth/me, /auth/password, /students/{id}
 */

export const profileAPI = {
  // Get current user profile
  async getProfile() {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  // Change password
  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) {
    const response = await apiClient.put('/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    return response.data;
  },

  // Get student details
  async getStudentProfile(studentId: string) {
    const response = await apiClient.get(`/students/${studentId}`);
    return response.data;
  },

  // Update student profile
  async updateStudentProfile(
    studentId: string,
    data: { name?: string; email?: string; phone?: string }
  ) {
    const response = await apiClient.put(`/students/${studentId}`, data);
    return response.data;
  },
};
