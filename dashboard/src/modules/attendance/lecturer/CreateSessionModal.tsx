import React, { useState, useEffect } from "react";
import { X, MapPin, Clock, Radius, Zap, BookOpen } from "lucide-react";
import type { CreateSessionRequest } from "../types";
import { useGPSLocation } from "../hooks/useGPSLocation";
import { apiRequest } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";

interface AssignedSubject {
  id: string;
  assignment_id?: string;
  name: string;
  trainer_id?: string;
  trainer_name?: string;
  module_id: string;
  module_name: string;
  course_id: string;
  course_name: string;
  cbet_level: string;
}

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSessionRequest) => Promise<void>;
  courseId?: string;
  isLoading?: boolean;
}

const inputCls = "w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm";
const labelCls = "block text-sm font-medium text-slate-300 mb-1.5";

export function CreateSessionModal({ isOpen, onClose, onSubmit, isLoading = false }: CreateSessionModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<CreateSessionRequest>({
    subject_id: undefined,
    latitude: 0,
    longitude: 0,
    allowed_radius_meters: 100,
    duration_minutes: 60,
    regeneration_interval: 25,
  });

  const { location, requestLocation, loading: locationLoading } = useGPSLocation();
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<AssignedSubject[]>([]);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("");
  const [useCustomRefresh, setUseCustomRefresh] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubjectsLoading(true);
    apiRequest<AssignedSubject[]>("/api/v1/trainer/assigned-subjects")
      .then((data) => {
        setSubjects(data);
        if (data.length === 1) {
          setSelectedSubjectKey(data[0].assignment_id ?? data[0].id);
          setFormData((prev) => ({ ...prev, subject_id: data[0].id }));
        }
      })
      .catch(() => setError("Failed to load your assigned subjects."))
      .finally(() => setSubjectsLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (location) {
      setFormData((prev) => ({ ...prev, latitude: location.latitude, longitude: location.longitude }));
    }
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.latitude || !formData.longitude) { setError("Please capture your location"); return; }
    if (!formData.subject_id) { setError("Please select a subject"); return; }
    const refreshInterval = formData.regeneration_interval ?? 25;
    if (refreshInterval < 10 || refreshInterval > 300) {
      setError("Token refresh must be between 10 and 300 seconds");
      return;
    }
    const selected = subjects.find((s) => (s.assignment_id ?? s.id) === selectedSubjectKey);
    if (user?.user_type === "admin" && !selected?.trainer_id) {
      setError("Please select a trainer-assigned subject");
      return;
    }
    try {
      await onSubmit({
        ...formData,
        trainer_id: selected?.trainer_id,
        course_id: selected?.course_id,
        module_id: selected?.module_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  };

  const selectedSubject = subjects.find((s) => (s.assignment_id ?? s.id) === selectedSubjectKey);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-slate-100">Start Attendance Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className={labelCls + " flex items-center gap-1.5"}>
              <BookOpen size={14} /> Subject <span className="text-red-400">*</span>
            </label>
            {subjectsLoading ? (
              <div className={inputCls + " text-slate-500"}>Loading your subjects...</div>
            ) : subjects.length === 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-amber-300 text-sm">No subjects assigned to you. Contact your administrator.</p>
              </div>
            ) : (
              <>
                <select
                  value={selectedSubjectKey}
                  onChange={(e) => {
                    const selected = subjects.find((s) => (s.assignment_id ?? s.id) === e.target.value);
                    setSelectedSubjectKey(e.target.value);
                    setFormData({ ...formData, subject_id: selected?.id });
                  }}
                  required
                  className={inputCls}
                >
                  <option value="" disabled>Select a subject</option>
                  {subjects.map((s) => (
                    <option key={`${s.trainer_id ?? "trainer"}-${s.id}`} value={s.assignment_id ?? s.id}>
                      {s.name}{s.trainer_name ? ` — ${s.trainer_name}` : ""}
                    </option>
                  ))}
                </select>
                {selectedSubject && (
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedSubject.course_name} ({selectedSubject.cbet_level}) › {selectedSubject.module_name}
                    {selectedSubject.trainer_name ? ` › ${selectedSubject.trainer_name}` : ""}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Location */}
          <div>
            <label className={labelCls + " flex items-center gap-1.5"}>
              <MapPin size={14} /> Your Location <span className="text-red-400">*</span>
            </label>
            {location ? (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-300">Location Captured</p>
                    <p className="text-xs text-green-400 font-mono mt-0.5">
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </p>
                    {location.accuracy && (
                      <p className="text-xs text-slate-500 mt-0.5">Accuracy: ±{location.accuracy.toFixed(0)}m</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={requestLocation}
                disabled={locationLoading}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm font-medium"
              >
                <MapPin size={16} />
                {locationLoading ? "Capturing..." : "Capture My Location"}
              </button>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className={labelCls + " flex items-center gap-1.5"}>
              <Clock size={14} /> Duration (minutes)
            </label>
            <input
              type="number" min={5} max={480}
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
              className={inputCls}
            />
            <p className="text-xs text-slate-500 mt-1">Recommended: 30–120 minutes</p>
          </div>

          {/* Radius */}
          <div>
            <label className={labelCls + " flex items-center gap-1.5"}>
              <Radius size={14} /> Allowed Radius (meters)
            </label>
            <input
              type="number" min={10} max={1000}
              value={formData.allowed_radius_meters}
              onChange={(e) => setFormData({ ...formData, allowed_radius_meters: parseInt(e.target.value) })}
              className={inputCls}
            />
            <p className="text-xs text-slate-500 mt-1">Default: 100m (classroom size)</p>
          </div>

          {/* Token Refresh */}
          <div>
            <label className={labelCls + " flex items-center gap-1.5"}>
              <Zap size={14} /> Token Refresh (seconds)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={useCustomRefresh ? "custom" : formData.regeneration_interval}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setUseCustomRefresh(true);
                    return;
                  }
                  setUseCustomRefresh(false);
                  setFormData({ ...formData, regeneration_interval: parseInt(e.target.value) });
                }}
                className={inputCls}
              >
                <option value={10}>10 seconds</option>
                <option value={20}>20 seconds</option>
                <option value={25}>25 seconds</option>
                <option value={30}>30 seconds</option>
                <option value="custom">Custom</option>
              </select>
              <input
                type="number"
                min={10}
                max={300}
                step={1}
                disabled={!useCustomRefresh}
                value={formData.regeneration_interval}
                onChange={(e) => setFormData({ ...formData, regeneration_interval: parseInt(e.target.value || "25") })}
                className={inputCls + " disabled:opacity-50"}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Use 10-300 seconds. Lower values refresh more often and are more secure.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !location || subjects.length === 0}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {isLoading ? "Creating..." : "Start Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
