/**
 * API Service for CC Shifter
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
      throw error;
    }

    return data;
  }

  // Auth
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
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

  async publishSchedule(id) {
    return this.request(`/schedules/${id}/publish`, {
      method: 'POST'
    });
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
}

export const api = new ApiService();
export default api;
