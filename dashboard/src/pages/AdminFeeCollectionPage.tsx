import { useState, useEffect } from 'react';
import { Printer, AlertCircle, Info, Download } from 'lucide-react';
import { adminReportsV2API } from '../api/admin';
import { exportExcel } from '../utils/exportUtils';
import {
  ReportActionButton,
  ReportMetricCard,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

interface CourseRow {
  course_id: string; course_name: string; student_count: number;
  total_billed: number; total_paid: number; collection_rate: number;
}
interface FeeReport {
  school: { name: string; location: string };
  term: { id: string | null; name: string | null };
  summary: { total_billed: number; total_collected: number; outstanding: number; collection_rate: number };
  by_course: CourseRow[];
  defaulters: Array<{ student_name: string; course_name: string; amount_due: number; paid: number; balance: number }>;
  note: string | null;
  generated_at: string;
  generated_by: string;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

export default function AdminFeeCollectionPage() {
  const [data, setData] = useState<FeeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDefaulters, setShowDefaulters] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await adminReportsV2API.getFeeCollection() as FeeReport;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExcelExport = () => {
    if (!data) return;
    exportExcel(
      [
        { name: 'By Course', rows: data.by_course as unknown as Record<string, unknown>[] },
        { name: 'Defaulters', rows: data.defaulters as unknown as Record<string, unknown>[] },
      ],
      `fee-collection-${data.term.name ?? 'all'}`,
      { generatedBy: data.generated_by, reportTitle: 'Fee Collection Report' }
    );
  };

  if (loading) return (
    <ReportPage>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    </ReportPage>
  );

  if (error) return (
    <ReportPage>
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center">
        <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
      </div>
    </ReportPage>
  );

  if (!data) return null;

  return (
    <ReportPage>
      <ReportToolbar
        maxWidth="max-w-5xl"
        title="Fee Collection Report"
        description="Track billed amounts, cash collection progress, and outstanding balances across courses."
        eyebrow="Admin Reports"
      >
        <ReportActionButton onClick={() => window.print()} icon={Printer}>
          Print
        </ReportActionButton>
        <ReportActionButton onClick={handleExcelExport} icon={Download} variant="success">
          Excel
        </ReportActionButton>
      </ReportToolbar>

      <ReportSurface maxWidth="max-w-5xl">
        <div className="border-b border-white/10 pb-6 text-center">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70 print:block">Confidential</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{data.school.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{data.school.location}</p>
          <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">Fee Collection Report</h2>
          {data.term.name ? <p className="mt-2 text-sm text-slate-400">{data.term.name}</p> : null}
        </div>

        {data.note ? (
          <div className="mt-6">
            <ReportNotice icon={Info} tone="info">{data.note}</ReportNotice>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ReportMetricCard label="Total Billed" value={fmt(data.summary.total_billed)} accent="slate" />
          <ReportMetricCard
            label="Collected"
            value={fmt(data.summary.total_collected)}
            accent="emerald"
            helper={`${data.summary.collection_rate}% collection rate`}
          />
          <ReportMetricCard
            label="Outstanding"
            value={fmt(data.summary.outstanding)}
            accent={data.summary.outstanding > 0 ? 'rose' : 'slate'}
            helper={data.summary.total_billed > 0 ? `${(100 - data.summary.collection_rate).toFixed(1)}% remaining` : undefined}
          />
        </div>

        <div className="mt-6">
          <ReportSectionTitle>Collection Rate by Course</ReportSectionTitle>
          <div className="space-y-3 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            {data.by_course.length === 0 ? (
              <p className="text-sm text-slate-500">No course data available.</p>
            ) : data.by_course.map(row => (
              <div key={row.course_id} className="grid gap-2 sm:grid-cols-[minmax(0,220px)_90px_minmax(0,1fr)_56px] sm:items-center sm:gap-3">
                <span className="truncate text-sm text-slate-200">{row.course_name}</span>
                <span className="text-xs text-slate-500 sm:text-right">{row.student_count} students</span>
                <div className="h-4 rounded-full bg-slate-800">
                  <div
                    className={`h-4 rounded-full ${row.collection_rate >= 80 ? 'bg-emerald-500' : row.collection_rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${row.collection_rate}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-300 sm:text-right">{row.collection_rate}%</span>
              </div>
            ))}
          </div>
        </div>

        {data.defaulters.length > 0 ? (
          <div className="mt-6">
            <button
              onClick={() => setShowDefaulters(!showDefaulters)}
              className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-200 print:hidden"
            >
              {showDefaulters ? 'Hide' : 'Show'} Outstanding Balances ({data.defaulters.length})
            </button>
            <h3 className="mb-3 hidden text-sm font-semibold uppercase tracking-[0.22em] text-slate-300 print:block">
              Outstanding Balances
            </h3>
            <div className={`${showDefaulters ? 'block' : 'hidden print:block'}`}>
              <div className="overflow-x-auto rounded-[28px] border border-white/10">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-800/90 text-white">
                      <th className="px-3 py-3 text-left">Student</th>
                      <th className="px-3 py-3 text-left">Course</th>
                      <th className="px-3 py-3 text-right">Amount Due</th>
                      <th className="px-3 py-3 text-right">Paid</th>
                      <th className="px-3 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.defaulters.map((d, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}>
                        <td className="px-3 py-3 font-medium text-slate-100">{d.student_name}</td>
                        <td className="px-3 py-3 text-slate-400">{d.course_name}</td>
                        <td className="px-3 py-3 text-right text-slate-100">{fmt(d.amount_due)}</td>
                        <td className="px-3 py-3 text-right text-emerald-300">{fmt(d.paid)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-red-300">{fmt(d.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-right text-xs text-slate-500">
          Generated by {data.generated_by} on {new Date(data.generated_at).toLocaleString()}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}
