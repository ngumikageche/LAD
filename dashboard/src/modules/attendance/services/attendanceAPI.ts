import { apiRequest } from "../../../api/client";
import type { AttendanceSession, AttendanceRecord, SessionSummary, CheckinResponse, CreateSessionRequest } from "../types";

const BASE = "/api/v1/attendance";

export class AttendanceAPI {
  static async createSession(data: CreateSessionRequest): Promise<{ session: AttendanceSession; current_token: string }> {
    return apiRequest(`${BASE}/sessions`, { method: "POST", body: data });
  }

  static async getSession(sessionId: string): Promise<AttendanceSession> {
    return apiRequest(`${BASE}/sessions/${sessionId}`);
  }

  static async getSessionRecords(sessionId: string): Promise<{ session_id: string; records: AttendanceRecord[]; total: number }> {
    return apiRequest(`${BASE}/sessions/${sessionId}/records`);
  }

  static async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    return apiRequest(`${BASE}/sessions/${sessionId}/summary`);
  }

  static async endSession(sessionId: string): Promise<{ session: AttendanceSession }> {
    return apiRequest(`${BASE}/sessions/${sessionId}/end`, { method: "POST", body: {} });
  }

  static async regenerateToken(sessionId: string): Promise<{ new_token: string; session: AttendanceSession }> {
    return apiRequest(`${BASE}/sessions/${sessionId}/regenerate-token`, { method: "POST", body: {} });
  }

  static async submitAttendance(sessionId: string, token: string, latitude: number, longitude: number): Promise<CheckinResponse> {
    // Use raw fetch so 400/409 business errors (already-checked-in, GPS fail)
    // are returned as structured responses instead of thrown exceptions.
    const authToken = sessionStorage.getItem('lad.session.token');
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000'}${BASE}/checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ session_id: sessionId, token, latitude, longitude }),
    });
    const data = await response.json() as CheckinResponse & { error?: string };
    if (data.error) throw new Error(data.error);
    return data;
  }

  static async getAttendanceHistory(limit = 50): Promise<{ student_id: string; records: AttendanceRecord[]; total: number }> {
    return apiRequest(`${BASE}/history?limit=${limit}`);
  }

  /** Look up a session by its current QR token (public, no auth). */
  static async getSessionByToken(token: string): Promise<{ id: string; session_code: string; status: string; seconds_until_expiry: number; allowed_radius_meters: number }> {
    return apiRequest(`${BASE}/sessions/by-token/${token}`);
  }

  /** Look up a session by its 6-char manual code (public, no auth). */
  static async getSessionByCode(sessionCode: string): Promise<{ id: string; session_code: string; current_token: string; status: string; seconds_until_expiry: number; allowed_radius_meters: number }> {
    return apiRequest(`${BASE}/sessions/by-code/${sessionCode.toUpperCase()}`);
  }

  /** Look up a session by UUID (public, no auth). */
  static async getSessionPublic(sessionId: string): Promise<{ id: string; session_code: string; status: string; seconds_until_expiry: number; allowed_radius_meters: number }> {
    return apiRequest(`${BASE}/sessions/${sessionId}/public`);
  }
}
