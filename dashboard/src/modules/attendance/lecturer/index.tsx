import React, { useState } from "react";
import { Play, Users, Timer, QrCode } from "lucide-react";
import type { CreateSessionRequest } from "../types";
import { CreateSessionModal } from "./CreateSessionModal";
import { QRDisplay } from "./QRDisplay";
import { AttendanceTable } from "./AttendanceTable";
import { useAttendanceSession } from "../hooks/useAttendanceSession";

interface LecturerAttendanceDashboardProps {
  courseId?: string;
}

export function LecturerAttendanceDashboard({ courseId }: LecturerAttendanceDashboardProps) {
  const [showModal, setShowModal] = useState(false);
  const { session, token, loading, error, createSession, endSession, setToken } = useAttendanceSession();
  const [summary, setSummary] = useState<null>(null);

  const handleCreateSession = async (data: CreateSessionRequest) => {
    await createSession(data);
    setShowModal(false);
  };

  const handleEndSession = async () => {
    if (window.confirm("Are you sure you want to end this attendance session?")) {
      await endSession();
      setSummary(null);
    }
  };

  if (!session) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Attendance</h1>
          <p className="text-sm text-slate-400 mt-1">Start a session to enable students to check in with QR codes</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Start card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-1">No Active Session</h2>
              <p className="text-slate-400 text-sm">Start a new attendance session to begin tracking</p>
            </div>
            <div className="w-14 h-14 bg-indigo-500/15 border border-indigo-500/30 rounded-xl flex items-center justify-center">
              <QrCode size={28} className="text-indigo-400" />
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
          >
            <Play size={18} />
            {loading ? "Creating..." : "Start Attendance Session"}
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: QrCode, color: "text-indigo-400", bg: "bg-indigo-500/15 border-indigo-500/30", title: "Rotating QR", desc: "QR codes refresh every 20–30 seconds to prevent screenshot reuse" },
            { icon: Timer, color: "text-teal-400", bg: "bg-teal-500/15 border-teal-500/30", title: "Live Updates", desc: "See real-time check-ins as students scan the code" },
            { icon: Users, color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30", title: "GPS Verified", desc: "Student location is validated against your position" },
          ].map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className={`w-10 h-10 ${bg} border rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={20} className={color} />
              </div>
              <h3 className="font-semibold text-slate-200 mb-1">{title}</h3>
              <p className="text-slate-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>

        <CreateSessionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateSession}
          courseId={courseId}
          isLoading={loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>Attendance</span>
        <span>›</span>
        <span className="text-slate-300">Active Session</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QRDisplay session={session} token={token} onTokenRefresh={setToken} onEndSession={handleEndSession} isLoading={loading} />

        {/* Session details */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Session Details</h3>
            <div className="space-y-3">
              {[
                { label: "Status", value: <span className="px-2.5 py-1 bg-green-500/15 text-green-300 border border-green-500/30 rounded-full text-xs font-semibold capitalize">{session.status}</span> },
                { label: "Session Code", value: <span className="font-mono font-bold text-slate-100 tracking-widest">{session.session_code}</span> },
                { label: "GPS Radius", value: <span className="text-slate-200 font-semibold">{session.allowed_radius_meters}m</span> },
                { label: "Expires In", value: <span className="text-slate-200 font-semibold">{session.seconds_until_expiry}s</span> },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
                  <span className="text-slate-400 text-sm">{label}</span>
                  {value}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AttendanceTable sessionId={session.id} autoRefresh={true} refreshInterval={2000} />
    </div>
  );
}
