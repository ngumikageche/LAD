import { useState, useEffect, useRef } from 'react';
import { Printer, Download, AlertCircle } from 'lucide-react';
import { reportsAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface SubjectRow {
  subject_name: string;
  assessment_name: string | null;
  marks_obtained: number;
  total_marks: number | null;
  percentage: number | null;
  grade: string | null;
  is_passed: boolean | null;
  feedback: string | null;
}

interface ReportCard {
  school: { name: string; location: string; type: string };
  student: { id: string; name: string; registration_number: string; enrollment_year: number; course: string | null };
  term: { id: string | null; name: string | null; start_date: string | null; end_date: string | null };
  subjects: SubjectRow[];
  attendance: { total: number; present: number; absent: number; late: number };
  generated_at: string;
}

export default function ReportCardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const studentId = user?.student_id;

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await reportsAPI.getReportCard(studentId) as ReportCard;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report card');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId]);

  const handlePrint = () => window.print();

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
        <AlertCircle size={20} />{error}
      </div>
    </div>
  );

  if (!data) return null;

  const attPct = data.attendance.total > 0
    ? Math.round(data.attendance.present / data.attendance.total * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-200 p-6 print:bg-white print:p-0">
      {/* Toolbar — hidden on print */}
      <div className="max-w-3xl mx-auto mb-4 flex gap-3 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          <Printer size={18} /> Print
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition font-medium"
        >
          <Download size={18} /> Download PDF
        </button>
      </div>

      {/* A4 Card */}
      <div
        ref={printRef}
        className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none print:max-w-none"
        style={{ minHeight: '297mm', padding: '20mm' }}
      >
        {/* Header */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">{data.school.name}</h1>
          <p className="text-sm text-gray-600">{data.school.location}</p>
          <h2 className="text-lg font-bold text-gray-800 mt-2 uppercase">Student Report Card</h2>
          {data.term.name && (
            <p className="text-sm text-gray-600">{data.term.name}</p>
          )}
        </div>

        {/* Student Info */}
        <div className="grid grid-cols-3 gap-4 mb-6 p-3 bg-gray-50 border border-gray-200 rounded">
          <div>
            <span className="text-xs text-gray-500 uppercase">Name</span>
            <p className="font-semibold text-gray-900">{data.student.name}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Reg. No.</span>
            <p className="font-semibold text-gray-900">{data.student.registration_number}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Course</span>
            <p className="font-semibold text-gray-900">{data.student.course ?? '—'}</p>
          </div>
        </div>

        {/* Subjects Table */}
        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Subject</th>
              <th className="px-3 py-2 text-left">Assessment</th>
              <th className="px-3 py-2 text-center">Marks</th>
              <th className="px-3 py-2 text-center">%</th>
              <th className="px-3 py-2 text-center">Grade</th>
              <th className="px-3 py-2 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-gray-400">No scores recorded for this term</td>
              </tr>
            ) : data.subjects.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-medium text-gray-900">{row.subject_name}</td>
                <td className="px-3 py-2 text-gray-600">{row.assessment_name ?? '—'}</td>
                <td className="px-3 py-2 text-center">
                  {row.marks_obtained}{row.total_marks ? `/${row.total_marks}` : ''}
                </td>
                <td className="px-3 py-2 text-center">{row.percentage != null ? `${row.percentage}%` : '—'}</td>
                <td className="px-3 py-2 text-center font-bold">{row.grade ?? '—'}</td>
                <td className="px-3 py-2 text-center">
                  {row.is_passed === true
                    ? <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">Pass</span>
                    : row.is_passed === false
                      ? <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium">Fail</span>
                      : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Attendance */}
        <div className="mb-6 p-3 border border-gray-200 rounded">
          <h3 className="font-semibold text-gray-800 mb-2">Attendance Summary</h3>
          <div className="flex gap-6 text-sm">
            <span>Total Days: <strong>{data.attendance.total}</strong></span>
            <span className="text-green-700">Present: <strong>{data.attendance.present}</strong></span>
            <span className="text-red-700">Absent: <strong>{data.attendance.absent}</strong></span>
            <span className="text-amber-700">Late: <strong>{data.attendance.late}</strong></span>
            <span>Attendance: <strong>{attPct}%</strong></span>
          </div>
        </div>

        {/* Remarks */}
        <div className="grid grid-cols-2 gap-6 mb-10">
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Class Teacher Remarks</p>
            <div className="border-b border-gray-400 h-8" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Principal Remarks</p>
            <div className="border-b border-gray-400 h-8" />
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-6 mt-8">
          <div>
            <div className="border-b border-gray-400 mb-1" />
            <p className="text-xs text-gray-500">Class Teacher / Date</p>
          </div>
          <div>
            <div className="border-b border-gray-400 mb-1" />
            <p className="text-xs text-gray-500">Principal / Date</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-right mt-6">
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:shadow-none, .print\\:shadow-none * { visibility: visible; }
          .print\\:shadow-none { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
