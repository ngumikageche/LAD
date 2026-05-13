// Attendance Module Exports
export { LecturerAttendanceDashboard } from "./lecturer";
export { StudentCheckIn } from "./student";
export { QRDisplay } from "./lecturer/QRDisplay";
export { AttendanceTable } from "./lecturer/AttendanceTable";
export { CreateSessionModal } from "./lecturer/CreateSessionModal";
export { QRScanner } from "./student/QRScanner";
export { useAttendanceSession, useGPSLocation, useQRScanner } from "./hooks";
export { AttendanceAPI } from "./services/attendanceAPI";
export type { AttendanceSession, AttendanceRecord, SessionSummary, CheckinResponse, StudentLocation, CreateSessionRequest } from "./types";
