import { apiClient } from './client';

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
  async getSystemAnalytics() {
    try {
      const response = await apiClient.get('/admin/analytics');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async getCourseAnalytics(courseId: string) {
    try {
      const response = await apiClient.get(`/admin/analytics/course/${courseId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async getDepartmentAnalytics(departmentId: string) {
    try {
      const response = await apiClient.get(`/admin/analytics/department/${departmentId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async getStudentPerformanceAnalytics() {
    try {
      const response = await apiClient.get('/admin/analytics/student-performance');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async generateReport(type: string, filters?: any) {
    try {
      const response = await apiClient.post('/admin/analytics/report', { type, filters });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Admin Scores API
export const adminScoresAPI = {
  async getScores(filters?: any) {
    try {
      const url = new URL(apiClient.defaults.baseURL + '/admin/scores');
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }
      const response = await apiClient.get('/admin/scores');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async addScore(scoreData: any) {
    try {
      const response = await apiClient.post('/admin/scores', scoreData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateScore(scoreId: string, updateData: any) {
    try {
      const response = await apiClient.put(`/admin/scores/${scoreId}`, updateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteScore(scoreId: string) {
    try {
      const response = await apiClient.delete(`/admin/scores/${scoreId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async validateScores(scores: any[]) {
    try {
      const response = await apiClient.post('/admin/scores/validate', { scores });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async uploadScoresCSV(file: File) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/admin/scores/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
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
    try {
      const response = await apiClient.get('/admin/notifications');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async createNotification(data: any) {
    try {
      const response = await apiClient.post('/admin/notifications', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateNotification(id: string, data: any) {
    try {
      const response = await apiClient.put(`/admin/notifications/${id}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteNotification(id: string) {
    try {
      const response = await apiClient.delete(`/admin/notifications/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async sendNotification(id: string) {
    try {
      const response = await apiClient.post(`/admin/notifications/${id}/send`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async scheduleNotification(id: string, sendAt: string) {
    try {
      const response = await apiClient.post(`/admin/notifications/${id}/schedule`, { send_at: sendAt });
      return response.data;
    } catch (error) {
      throw error;
    }
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
