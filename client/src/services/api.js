/**
 * API Service for Shifter for ICES
 */

const API_BASE = '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken() {
    return this.token || localStorage.getItem('token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.getToken()) {
      headers['Authorization'] = `Bearer ${this.getToken()}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || 'An error occurred');
      error.status = response.status;
      error.data = data;
      error.code = data.code;
      throw error;
    }

    return data;
  }

  // Auth
  async login(email, password, totpCode) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totpCode })
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async register(email, password, name, engineerId) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, engineerId })
    });
    this.setToken(data.token);
    return data;
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Engineers
  async getEngineers(activeOnly = false) {
    return this.request(`/engineers?active=${activeOnly}`);
  }

  async getEngineer(id) {
    return this.request(`/engineers/${id}`);
  }

  async createEngineer(data) {
    return this.request('/engineers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateEngineer(id, data) {
    return this.request(`/engineers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteEngineer(id) {
    return this.request(`/engineers/${id}`, {
      method: 'DELETE'
    });
  }

  async updateEngineerPreferences(id, preferences) {
    return this.request(`/engineers/${id}/preferences`, {
      method: 'PUT',
      body: JSON.stringify({ preferences })
    });
  }

  async updateEngineerUnavailable(id, unavailableDays) {
    return this.request(`/engineers/${id}/unavailable`, {
      method: 'PUT',
      body: JSON.stringify({ unavailableDays })
    });
  }

  async getEngineerHolidays(id, year) {
    return this.request(`/engineers/${id}/holidays?year=${year}`);
  }

  async getStates() {
    return this.request('/engineers/states');
  }

  // Engineer unavailable dates (enhanced)
  async getEngineerUnavailableDates(id) {
    return this.request(`/engineers/${id}/unavailable-dates`);
  }

  async addEngineerUnavailableDates(id, dates) {
    return this.request(`/engineers/${id}/unavailable-dates`, {
      method: 'POST',
      body: JSON.stringify({ dates })
    });
  }

  async removeEngineerUnavailableDates(id, dates) {
    return this.request(`/engineers/${id}/unavailable-dates`, {
      method: 'DELETE',
      body: JSON.stringify({ dates })
    });
  }

  // Engineer bulk upload (Excel)
  async bulkUploadEngineersExcel(excelData) {
    return this.request('/engineers/bulk-upload-excel', {
      method: 'POST',
      body: JSON.stringify({ excelData })
    });
  }

  // Engineer export
  async exportEngineersCSV() {
    const response = await fetch(`${API_BASE}/engineers/export/csv`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });
    return response.blob();
  }

  async exportEngineersExcel() {
    const response = await fetch(`${API_BASE}/engineers/export/excel`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });
    return response.blob();
  }

  // Schedules
  async getSchedules(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/schedules?${params}`);
  }

  async getSchedule(id) {
    return this.request(`/schedules/${id}`);
  }

  async getScheduleForMonth(year, month, published = false) {
    return this.request(`/schedules/month/${year}/${month}?published=${published}`);
  }

  async getEngineerViewSchedule(year, month) {
    return this.request(`/schedules/engineer-view/${year}/${month}`);
  }

  async generateSchedule(year, month, options = {}) {
    return this.request('/schedules/generate', {
      method: 'POST',
      body: JSON.stringify({ year, month, options })
    });
  }

  async generateWithOption(year, month, optionId) {
    return this.request('/schedules/generate-with-option', {
      method: 'POST',
      body: JSON.stringify({ year, month, optionId })
    });
  }

  async updateSchedule(id, data) {
    return this.request(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ data })
    });
  }

  async updateScheduleShift(id, engineerId, date, shift) {
    return this.request(`/schedules/${id}/shift`, {
      method: 'PUT',
      body: JSON.stringify({ engineerId, date, shift })
    });
  }

  async publishSchedule(id) {
    return this.request(`/schedules/${id}/publish`, {
      method: 'POST'
    });
  }

  async archiveSchedule(id) {
    return this.request(`/schedules/${id}/archive`, {
      method: 'POST'
    });
  }

  async getArchivedSchedules() {
    return this.request('/schedules/archived');
  }

  async exportSchedule(id) {
    return this.request(`/schedules/${id}/export`);
  }

  async getHolidaysForMonth(year, month) {
    return this.request(`/schedules/holidays/${year}/${month}`);
  }

  // Requests
  async getRequests(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/requests?${params}`);
  }

  async getPendingRequests() {
    return this.request('/requests/pending');
  }

  async getRequest(id) {
    return this.request(`/requests/${id}`);
  }

  async createRequest(data) {
    return this.request('/requests', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async approveRequest(id, notes = '') {
    return this.request(`/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  async rejectRequest(id, notes) {
    return this.request(`/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  async cancelRequest(id) {
    return this.request(`/requests/${id}`, {
      method: 'DELETE'
    });
  }

  async getRequestTypes() {
    return this.request('/requests/types/list');
  }

  // System / Admin
  async getVersion() {
    return this.request('/system/version');
  }

  async getFullVersion() {
    return this.request('/system/version/full');
  }

  async getUpdateStatus() {
    return this.request('/system/update-status');
  }

  async checkForUpdate() {
    return this.request('/system/check-update', { method: 'POST' });
  }

  async configureUpdateCheck(interval) {
    return this.request('/system/configure-update-check', {
      method: 'POST',
      body: JSON.stringify({ interval })
    });
  }

  async applyUpdate() {
    return this.request('/system/apply-update', { method: 'POST' });
  }

  async getSystemSettings() {
    return this.request('/system/settings');
  }

  async updateSystemSettings(settings) {
    return this.request('/system/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  async getEmailConfig() {
    return this.request('/system/email-config');
  }

  async updateSmtpSettings(settings) {
    return this.request('/system/smtp-settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  async sendTestEmail(to) {
    return this.request('/system/test-email', {
      method: 'POST',
      body: JSON.stringify({ to })
    });
  }

  async getUsers() {
    return this.request('/system/users');
  }

  async updateUserNotifications(userId, emailNotifications) {
    return this.request(`/system/users/${userId}/notifications`, {
      method: 'PUT',
      body: JSON.stringify({ emailNotifications })
    });
  }

  async linkUserToEngineer(userId, engineerId) {
    return this.request(`/system/users/${userId}/engineer-link`, {
      method: 'PUT',
      body: JSON.stringify({ engineerId })
    });
  }

  // Password management
  async generatePassword() {
    return this.request('/auth/generate-password', { method: 'POST' });
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async adminResetPassword(userId, newPassword, generateNew, sendEmail) {
    return this.request('/auth/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword, generateNew, sendEmail })
    });
  }

  // 2FA
  async setup2FA() {
    return this.request('/auth/2fa/setup', { method: 'POST' });
  }

  async verify2FA(code) {
    return this.request('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async disable2FA(password) {
    return this.request('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  // Locked accounts
  async getLockedAccounts() {
    return this.request('/auth/locked-accounts');
  }

  async unlockAccount(email) {
    return this.request('/auth/unlock-account', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  // Admin user management
  async createAdmin(email, name, password, generatePassword) {
    return this.request('/auth/admin/create-admin', {
      method: 'POST',
      body: JSON.stringify({ email, name, password, generatePassword })
    });
  }

  async toggleUserAdmin(userId, isAdmin) {
    return this.request(`/auth/admin/user/${userId}/admin`, {
      method: 'PUT',
      body: JSON.stringify({ isAdmin })
    });
  }

  async adminManage2FA(userId, action) {
    return this.request(`/auth/admin/user/${userId}/2fa`, {
      method: 'PUT',
      body: JSON.stringify({ action })
    });
  }

  // Engineer password management
  async resetEngineerPassword(engineerId, newPassword, generateNew, sendEmail) {
    return this.request(`/engineers/${engineerId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword, generateNew, sendEmail })
    });
  }

  async createEngineerUser(engineerId, password, generatePassword, sendEmail, isAdmin) {
    return this.request(`/engineers/${engineerId}/create-user`, {
      method: 'POST',
      body: JSON.stringify({ password, generatePassword, sendEmail, isAdmin })
    });
  }

  // Latest published schedule
  async getLatestPublishedSchedule() {
    return this.request('/schedules/latest-published');
  }

  // Delete schedule
  async deleteSchedule(id) {
    return this.request(`/schedules/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiService();
export default api;
