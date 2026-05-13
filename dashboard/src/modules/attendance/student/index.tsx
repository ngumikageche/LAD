import React, { useState } from "react";
import { MapPin, Loader, CheckCircle, AlertCircle } from "lucide-react";
import { useGPSLocation } from "../hooks/useGPSLocation";
import { AttendanceAPI } from "../services/attendanceAPI";
import { QRScanner } from "./QRScanner";

interface StudentCheckInProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const cardCls = "bg-slate-900 border border-slate-800 rounded-2xl p-6";

export function StudentCheckIn({ onSuccess, onError }: StudentCheckInProps) {
  const [step, setStep] = useState<"scanner" | "location" | "processing" | "result">("scanner");
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [useManualEntry, setUseManualEntry] = useState(false);

  const { location, requestLocation, loading: locationLoading, error: locationError } = useGPSLocation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; distance?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleQRScan = async (data: string) => {
    setError(null);
    try {
      const sessionInfo = await AttendanceAPI.getSessionByToken(data);
      setScannedToken(data);
      setSessionId(sessionInfo.id);
      setStep("location");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid QR code");
    }
  };

  const handleManualCodeSubmit = async () => {
    if (!manualCode.trim()) { setError("Please enter a session code"); return; }
    try {
      const sessionInfo = await AttendanceAPI.getSessionByCode(manualCode);
      setSessionId(sessionInfo.id);
      setScannedToken(sessionInfo.current_token);
      setStep("location");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid session code");
    }
  };

  const handleCheckIn = async () => {
    if (!sessionId || !location || !scannedToken) { setError("Missing required information"); return; }
    setLoading(true);
    setStep("processing");
    setError(null);
    try {
      const response = await AttendanceAPI.submitAttendance(sessionId, scannedToken, location.latitude, location.longitude);
      setResult({ success: response.success, message: response.message, distance: response.record?.distance_from_trainer });
      setStep("result");
      if (response.success) onSuccess?.();
      else onError?.(response.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check-in failed";
      setResult({ success: false, message });
      setStep("result");
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep("scanner");
    setScannedToken(null);
    setSessionId(null);
    setManualCode("");
    setUseManualEntry(false);
    setResult(null);
    setError(null);
  };

  // ── STEP 1: Scanner ──────────────────────────────────────────────────────────
  if (step === "scanner") {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <QRScanner onScan={handleQRScan} />

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className={cardCls}>
          {!useManualEntry ? (
            <button
              onClick={() => setUseManualEntry(true)}
              className="w-full text-indigo-400 hover:text-indigo-300 font-medium text-sm transition"
            >
              Don't have a camera? Enter code manually
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-300">Enter 6-character session code</p>
              <input
                type="text"
                placeholder="XXXXXX"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-center font-mono text-2xl tracking-widest text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleManualCodeSubmit}
                disabled={manualCode.length !== 6}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition font-medium text-sm"
              >
                Continue with Code
              </button>
              <button
                onClick={() => setUseManualEntry(false)}
                className="w-full text-slate-400 hover:text-slate-300 text-sm transition"
              >
                ← Back to camera
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── STEP 2: Location ─────────────────────────────────────────────────────────
  if (step === "location") {
    return (
      <div className="max-w-lg mx-auto">
        <div className={cardCls + " space-y-5"}>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Allow Location Access</h2>
            <p className="text-slate-400 text-sm mt-1">
              We need your location to verify you're in the classroom.
            </p>
          </div>

          {location ? (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-start gap-3">
              <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-300 text-sm">Location Captured</p>
                <p className="text-xs text-green-400 font-mono mt-0.5">
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </p>
                {location.accuracy && (
                  <p className="text-xs text-slate-500 mt-0.5">Accuracy: ±{location.accuracy.toFixed(0)}m</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-start gap-3">
              <MapPin size={20} className="text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-indigo-300 text-sm">Location Required</p>
                <p className="text-xs text-slate-400 mt-0.5">Click the button below to share your location</p>
              </div>
            </div>
          )}

          {locationError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{locationError}</p>
            </div>
          )}

          <button
            onClick={requestLocation}
            disabled={locationLoading || !!location}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 font-medium text-sm"
          >
            {locationLoading ? (
              <><Loader size={18} className="animate-spin" /> Getting Location...</>
            ) : location ? (
              <><CheckCircle size={18} /> Location Captured</>
            ) : (
              <><MapPin size={18} /> Share My Location</>
            )}
          </button>

          <button
            onClick={handleCheckIn}
            disabled={!location || loading}
            className="w-full px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition font-medium text-sm"
          >
            {loading ? "Checking In..." : "Submit Attendance"}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 3: Processing ───────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div className="max-w-lg mx-auto">
        <div className={cardCls + " py-16 text-center"}>
          <Loader size={44} className="mx-auto text-indigo-400 animate-spin mb-4" />
          <h2 className="text-lg font-bold text-slate-100">Checking In...</h2>
          <p className="text-slate-400 text-sm mt-1">Please wait while we verify your attendance</p>
        </div>
      </div>
    );
  }

  // ── STEP 4: Result ───────────────────────────────────────────────────────────
  if (step === "result") {
    const isSuccess = result?.success;
    return (
      <div className="max-w-lg mx-auto">
        <div className={`${cardCls} text-center border-t-4 ${isSuccess ? "border-t-green-500" : "border-t-red-500"}`}>
          <div className="flex justify-center mb-4">
            {isSuccess
              ? <CheckCircle size={56} className="text-green-400" />
              : <AlertCircle size={56} className="text-red-400" />}
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isSuccess ? "text-green-300" : "text-red-300"}`}>
            {isSuccess ? "Attendance Recorded!" : "Check-In Failed"}
          </h2>
          <p className={`text-base mb-6 ${isSuccess ? "text-green-400" : "text-red-400"}`}>
            {result?.message}
          </p>
          {result?.distance !== undefined && (
            <div className="bg-slate-800 rounded-xl p-4 mb-6 inline-block">
              <p className="text-xs text-slate-400">Distance from instructor</p>
              <p className="text-2xl font-bold text-slate-100">{result.distance.toFixed(0)}m</p>
            </div>
          )}
          <button
            onClick={handleReset}
            className={`w-full px-4 py-3 rounded-xl font-medium transition ${
              isSuccess ? "bg-green-600 text-white hover:bg-green-700" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {isSuccess ? "Done" : "Try Again"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
