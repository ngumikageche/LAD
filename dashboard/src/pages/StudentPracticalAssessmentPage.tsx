import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Printer, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { reportsAPI } from '../api/student';
import type { PracticalAssessmentReport } from '../api/trainer';
import PracticalAssessmentReportView from '../components/practical/PracticalAssessmentReportView';

export default function StudentPracticalAssessmentPage() {
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [reports, setReports] = useState<PracticalAssessmentReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId = user?.student_id;

  useEffect(() => {
    const loadReports = async () => {
      if (!studentId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await reportsAPI.getPracticalAssessments(studentId);
        const items = Array.isArray(data) ? (data as PracticalAssessmentReport[]) : [];
        setReports(items);
        if (items.length > 0) {
          setSelectedReportId(items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load practical assessments');
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [studentId]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null,
    [reports, selectedReportId],
  );

  const releasedCount = reports.filter((report) => report.status === 'released').length;

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-lg shadow-slate-950/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-teal-300">Learner Portal</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-100">My Practical Assessment Reports</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Review your practical assessment results, remarks, and competency outcome.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Reports" value={String(reports.length)} />
            <Stat label="Released" value={String(releasedCount)} />
            <Stat label="Student ID" value={studentId ?? 'Not set'} />
          </div>
        </div>

        {error ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
            <FileText size={18} className="text-teal-300" />
            <h2 className="text-lg font-semibold text-slate-100">Reports</h2>
          </div>

          <div className="mt-4 space-y-2">
            {reports.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                No practical assessment reports have been released yet.
              </p>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedReportId === report.id
                      ? 'border-teal-500/40 bg-teal-500/10'
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-100">{report.unit_of_competency}</p>
                      <p className="text-xs text-slate-500">{report.unit_code}</p>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                      {report.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{report.period}</span>
                    <span>{report.total_score == null ? '--' : `${report.total_score.toFixed(1)} / 100`}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-sm font-semibold text-slate-200">Status Guide</p>
            <div className="mt-3 space-y-2 text-sm text-slate-400">
              <p><span className="font-semibold text-green-300">Released</span> - visible on your portal.</p>
              <p><span className="font-semibold text-amber-300">Complete</span> - waiting for release.</p>
              <p><span className="font-semibold text-slate-300">Draft</span> - still being edited by your trainer.</p>
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Report Preview</h2>
                <p className="text-sm text-slate-500">Printable assessment layout for the selected report.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePrint}
                  disabled={!selectedReport}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer size={16} />
                  Print
                </button>
                <button
                  onClick={handlePrint}
                  disabled={!selectedReport}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={16} />
                  Download PDF
                </button>
              </div>
            </div>

            {selectedReport ? (
              <div ref={printRef} className="mt-6">
                <PracticalAssessmentReportView
                  report={selectedReport}
                  studentName={selectedReport.student_name ?? user?.name ?? null}
                  studentRegistration={selectedReport.student_registration_number ?? null}
                />
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
                <ShieldCheck size={48} className="mx-auto mb-3 text-slate-600" />
                Select a report to view your practical assessment details.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
