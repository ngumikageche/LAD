import React from "react";
import { StudentCheckIn } from "../modules/attendance";
import { useNavigate } from "react-router-dom";

export default function StudentAttendanceCheckInPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Check In to Class</h1>
        <p className="text-slate-400">Scan the QR code displayed by your instructor or enter the session code manually.</p>
      </div>

      <StudentCheckIn
        onSuccess={() => setTimeout(() => navigate("/student/dashboard"), 2000)}
        onError={(err) => console.error("Check-in error:", err)}
      />

      <div className="mt-8 text-center">
        <button
          onClick={() => navigate("/student/dashboard")}
          className="text-indigo-400 hover:text-indigo-300 font-medium"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}
