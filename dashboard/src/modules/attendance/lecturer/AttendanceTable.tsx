import React, { useEffect, useState } from "react";
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import type { AttendanceRecord } from "../types";
import { AttendanceAPI } from "../services/attendanceAPI";

interface AttendanceTableProps {
  sessionId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const STATUS_BADGE: Record<string, string> = {
  success: "bg-green-500/15 text-green-300 border border-green-500/30",
  failed_gps: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  failed_duplicate: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
  failed_not_enrolled: "bg-red-500/15 text-red-300 border border-red-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  success: "Checked In",
  failed_gps: "Location Error",
  failed_duplicate: "Already Checked",
  failed_not_enrolled: "Not Enrolled",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle size={14} className="text-green-400" />;
  if (status === "failed_gps") return <AlertCircle size={14} className="text-amber-400" />;
  if (status === "failed_duplicate") return <AlertCircle size={14} className="text-orange-400" />;
  return <XCircle size={14} className="text-red-400" />;
}

export function AttendanceTable({ sessionId, autoRefresh = true, refreshInterval = 2000 }: AttendanceTableProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await AttendanceAPI.getSessionRecords(sessionId);
      setRecords(data.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    if (!autoRefresh) return;
    const interval = setInterval(fetchRecords, refreshInterval);
    return () => clearInterval(interval);
  }, [sessionId, autoRefresh, refreshInterval]);

  const successful = records.filter((r) => r.status === "success").length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Live Attendance</h3>
          <p className="text-sm text-slate-400 mt-0.5">
            <span className="text-green-400 font-semibold">{successful}</span> checked in · {records.length} total submissions
          </p>
        </div>
        <button
          onClick={fetchRecords}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        {records.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">
            {loading ? "Loading attendance records..." : "No attendance records yet"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800 border-b border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Check-In Time</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Distance</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Coordinates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[record.status] ?? "bg-slate-700 text-slate-300"}`}>
                      <StatusIcon status={record.status} />
                      {STATUS_LABEL[record.status] ?? record.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-200">{record.student_name ?? "Unknown"}</p>
                    <p className="text-xs text-slate-500 font-mono">{record.registration_number ?? record.student_id.substring(0, 8)}</p>
                  </td>
                  <td className="px-6 py-3 text-slate-400 text-xs">
                    {new Date(record.checked_in_at).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-3 text-slate-300 font-semibold text-xs">
                    {record.distance_from_trainer != null
                      ? record.distance_from_trainer < 1000
                        ? `${record.distance_from_trainer.toFixed(0)}m`
                        : `${(record.distance_from_trainer / 1000).toFixed(2)}km`
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-500 font-mono">
                    {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer summary */}
      {records.length > 0 && (
        <div className="border-t border-slate-800 px-6 py-4 grid grid-cols-4 gap-4 bg-slate-800/40">
          {[
            { label: "Total", value: records.length, color: "text-slate-100" },
            { label: "Successful", value: successful, color: "text-green-400" },
            { label: "GPS Errors", value: records.filter((r) => r.status === "failed_gps").length, color: "text-amber-400" },
            { label: "Duplicates", value: records.filter((r) => r.status === "failed_duplicate").length, color: "text-orange-400" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-xs text-slate-500 uppercase font-semibold">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
