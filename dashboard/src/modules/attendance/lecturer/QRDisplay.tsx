import React, { useEffect, useState, useRef } from "react";
import QRCode from "react-qr-code";
import { Clock, Copy, LogOut, RefreshCw } from "lucide-react";
import type { AttendanceSession } from "../types";
import { AttendanceAPI } from "../services/attendanceAPI";

interface QRDisplayProps {
  session: AttendanceSession;
  token: string;
  onTokenRefresh: (newToken: string) => void;
  onEndSession: () => void;
  isLoading?: boolean;
}

export function QRDisplay({ session, token, onTokenRefresh, onEndSession, isLoading = false }: QRDisplayProps) {
  const [displayToken, setDisplayToken] = useState(token);
  const [copiedCode, setCopiedCode] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.seconds_until_expiry);
  const [tokenSecondsLeft, setTokenSecondsLeft] = useState(session.regeneration_interval);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const tokenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTokenSecondsLeft(session.regeneration_interval);
    tokenTimerRef.current = setInterval(async () => {
      setTokenSecondsLeft((prev) => {
        if (prev <= 1) { regenerateToken(); return session.regeneration_interval; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (tokenTimerRef.current) clearInterval(tokenTimerRef.current); };
  }, [session.id, session.regeneration_interval]);

  const regenerateToken = async () => {
    setIsRegenerating(true);
    try {
      const result = await AttendanceAPI.regenerateToken(session.id);
      setDisplayToken(result.new_token);
      onTokenRefresh(result.new_token);
    } catch { /* silent — next cycle retries */ }
    finally { setIsRegenerating(false); }
  };

  useEffect(() => { setDisplayToken(token); }, [token]);

  const copySessionCode = () => {
    navigator.clipboard.writeText(session.session_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Attendance QR Code</h2>
        <p className="text-sm text-slate-400 mt-1">Share this QR code with students to check in</p>
      </div>

      {/* QR Code — white background required for scanners */}
      <div className="flex justify-center">
        <div className="bg-white p-5 rounded-xl inline-block">
          <QRCode value={displayToken || "invalid"} size={220} level="H" />
        </div>
      </div>

      {/* Session Code */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Session Code (Manual Entry)
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg font-mono text-xl tracking-widest text-center text-slate-100 select-all">
            {session.session_code}
          </div>
          <button
            onClick={copySessionCode}
            className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            title="Copy code"
          >
            <Copy size={18} />
          </button>
        </div>
        {copiedCode && <p className="text-green-400 text-xs mt-1.5">✓ Copied to clipboard</p>}
      </div>

      {/* Countdown */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock size={20} className="text-indigo-400" />
          <div>
            <p className="text-xs text-slate-400">Session Expires In</p>
            <p className="text-2xl font-bold text-indigo-400">{formatTime(secondsLeft)}</p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Radius: {session.allowed_radius_meters}m</p>
          <p>Refresh: {session.regeneration_interval}s</p>
        </div>
      </div>

      {/* Token regeneration indicator */}
      <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRegenerating ? "bg-amber-400 animate-ping" : "bg-green-400 animate-pulse"}`} />
          <p className="text-sm text-green-300">
            {isRegenerating ? "Regenerating token..." : `Token refreshes in ${tokenSecondsLeft}s`}
          </p>
        </div>
        <RefreshCw size={14} className={`text-green-400 ${isRegenerating ? "animate-spin" : ""}`} />
      </div>

      {/* Session meta */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Status", value: session.status },
          { label: "Started", value: new Date(session.started_at).toLocaleTimeString() },
          { label: "Session ID", value: session.id.substring(0, 8) + "…" },
          { label: "Subject", value: session.subject_id ? session.subject_id.substring(0, 8) + "…" : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">{label}</p>
            <p className="text-sm text-slate-200 font-mono mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* End session */}
      <button
        onClick={onEndSession}
        disabled={isLoading}
        className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center justify-center gap-2 font-medium"
      >
        <LogOut size={18} />
        {isLoading ? "Ending..." : "End Attendance Session"}
      </button>
    </div>
  );
}
