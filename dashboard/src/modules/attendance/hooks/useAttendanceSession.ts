// useAttendanceSession Hook
import { useState, useCallback, useEffect } from "react";
import type { AttendanceSession, CreateSessionRequest } from "../types";
import { AttendanceAPI } from "../services/attendanceAPI";

export function useAttendanceSession() {
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(
    async (data: CreateSessionRequest) => {
      setLoading(true);
      setError(null);
      try {
        const result = await AttendanceAPI.createSession(data);
        setSession(result.session);
        setToken(result.current_token);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create session";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const endSession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await AttendanceAPI.endSession(session.id);
      setSession(null);
      setToken("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to end session";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [session]);

  const refreshSession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await AttendanceAPI.getSession(session.id);
      setSession(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refresh session";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  return {
    session,
    token,
    loading,
    error,
    createSession,
    endSession,
    refreshSession,
    setSession,
    setToken,
  };
}
