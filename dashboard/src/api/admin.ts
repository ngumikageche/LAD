import { apiClient } from './client';

// Admin Phase-3 Reports API
export const adminReportsV2API = {
  async getExamResults(termId?: string) {
    const params = termId ? `?term_id=${termId}` : '';
    const response = await apiClient.get(`/reports/admin/exam-results${params}`);
    return response.data;
  },
  async getFeeCollection(termId?: string) {
    const params = termId ? `?term_id=${termId}` : '';
    const response = await apiClient.get(`/reports/admin/fees${params}`);
    return response.data;
  },
  async getEnrolmentOverview(termId?: string) {
    const params = termId ? `?term_id=${termId}` : '';
    const response = await apiClient.get(`/reports/admin/enrolment${params}`);
    return response.data;
  },
};

// Admin Dashboard API
export const adminDashboardAPI = {
  async getDashboardStats() {
    try {
      const response = await apiClient.get('/admin/dashboard/stats');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async getDashboardOverview() {
    try {
      const response = await apiClient.get('/admin/dashboard');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Analytics API
export const adminAnalyticsAPI = {
  async getDashboard() {
    const response = await apiClient.get('/admin/analytics/dashboard');
    return response.data;
  },

  async getCoursesAnalytics() {
    const response = await apiClient.get('/admin/analytics/courses');
    return response.data;
  },

  async getDepartmentsAnalytics() {
    const response = await apiClient.get('/admin/analytics/departments');
    return response.data;
  },

  async getInstitutionsAnalytics() {
    const response = await apiClient.get('/admin/analytics/institutions');
    return response.data;
  },

  async getComparisons() {
    const response = await apiClient.get('/admin/analytics/comparisons');
    return response.data;
  },

  async getSystemWideReport() {
    const response = await apiClient.get('/admin/analytics/system-wide-report');
    return response.data;
  },
};

// Admin Scores API
export const adminScoresAPI = {
  async getScores(filters?: { student_id?: string; subject_id?: string; term?: string; page?: number; per_page?: number }) {
    const params = new URLSearchParams();
    if (filters?.student_id) params.append('student_id', filters.student_id);
    if (filters?.subject_id) params.append('subject_id', filters.subject_id);
    if (filters?.term) params.append('term', filters.term);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.per_page) params.append('per_page', String(filters.per_page));
    const response = await apiClient.get(`/api/v1/admin/scores${params.toString() ? '?' + params.toString() : ''}`);
    return response.data;
  },

  async updateScore(scoreId: string, updateData: { marks_obtained?: number; grade?: string; feedback?: string }) {
    const response = await apiClient.put(`/api/v1/admin/scores/${scoreId}`, updateData);
    return response.data;
  },

  async deleteScore(scoreId: string) {
    const response = await apiClient.delete(`/api/v1/admin/scores/${scoreId}`);
    return response.data;
  },
};

// Admin Announcements API
export const adminAPI = {
  async getAnnouncements() {
    try {
      const response = await apiClient.get('/admin/announcements');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createAnnouncement(data: any) {
    try {
      const response = await apiClient.post('/admin/announcements', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateAnnouncement(id: string, data: any) {
    try {
      const response = await apiClient.put(`/admin/announcements/${id}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteAnnouncement(id: string) {
    try {
      const response = await apiClient.delete(`/admin/announcements/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async publishAnnouncement(id: string) {
    try {
      const response = await apiClient.put(`/admin/announcements/${id}/publish`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Notifications API
export const adminNotificationsAPI = {
  async getNotifications() {
    const response = await apiClient.get('/notifications');
    return response.data;
  },

  async createNotification(data: { title: string; message: string; user_id: string }) {
    const response = await apiClient.post('/notifications', data);
    return response.data;
  },

  async updateNotification(id: string, data: { title?: string; message?: string; is_read?: boolean }) {
    const response = await apiClient.put(`/notifications/${id}`, data);
    return response.data;
  },

  async deleteNotification(id: string) {
    const response = await apiClient.delete(`/notifications/${id}`);
    return response.data;
  },

  async sendNotification(id: string) {
    const response = await apiClient.put(`/notifications/${id}`, { is_read: false });
    return response.data;
  },
};

// Admin Users API
export const adminUsersAPI = {
  async getUsers(filters?: any) {
    try {
      const response = await apiClient.get('/admin/users', { params: filters });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createUser(userData: any) {
    try {
      const response = await apiClient.post('/admin/users', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateUser(userId: string, updateData: any) {
    try {
      const response = await apiClient.put(`/admin/users/${userId}`, updateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteUser(userId: string) {
    try {
      const response = await apiClient.delete(`/admin/users/${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deactivateUser(userId: string) {
    try {
      const response = await apiClient.put(`/admin/users/${userId}/deactivate`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async assignRole(userId: string, roleId: string) {
    try {
      const response = await apiClient.post(`/admin/users/${userId}/roles`, { role_id: roleId });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Institutions API
export const adminInstitutionsAPI = {
  async getInstitutions() {
    try {
      const response = await apiClient.get('/admin/institutions');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createInstitution(data: any) {
    try {
      const response = await apiClient.post('/admin/institutions', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateInstitution(id: string, data: any) {
    try {
      const response = await apiClient.put(`/admin/institutions/${id}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteInstitution(id: string) {
    try {
      const response = await apiClient.delete(`/admin/institutions/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Departments API
export const adminDepartmentsAPI = {
  async getDepartments() {
    try {
      const response = await apiClient.get('/admin/departments');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createDepartment(data: any) {
    try {
      const response = await apiClient.post('/admin/departments', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateDepartment(id: string, data: any) {
    try {
      const response = await apiClient.put(`/admin/departments/${id}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteDepartment(id: string) {
    try {
      const response = await apiClient.delete(`/admin/departments/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Courses API
export const adminCoursesAPI = {
  async getCourses() {
    try {
      const response = await apiClient.get('/admin/courses');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createCourse(data: any) {
    try {
      const response = await apiClient.post('/admin/courses', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateCourse(id: string, data: any) {
    try {
      const response = await apiClient.put(`/admin/courses/${id}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteCourse(id: string) {
    try {
      const response = await apiClient.delete(`/admin/courses/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Subjects API
export const adminSubjectsAPI = {
  async getSubjects() {
    try {
      const response = await apiClient.get('/admin/subjects');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createSubject(data: any) {
    try {
      const response = await apiClient.post('/admin/subjects', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateSubject(id: string, data: any) {
    try {
      const response = await apiClient.put(`/admin/subjects/${id}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteSubject(id: string) {
    try {
      const response = await apiClient.delete(`/admin/subjects/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};
