import { useState, useEffect } from 'react';
import { Printer, AlertCircle, Info } from 'lucide-react';
import { reportsAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';
import {
  ReportActionButton,
  ReportNotice,
  ReportPage,
  ReportPrintStyles,
  ReportSectionTitle,
  ReportSurface,
  ReportToolbar,
} from '../components/reports/PremiumReportLayout';

interface LineItem { description: string; amount: number; paid: number; balance: number; }
interface FeeReport {
  school: { name: string; location: string };
  student: { id: string; name: string; registration_number: string };
  term: { id: string | null; name: string | null };
  line_items: LineItem[];
  summary: { total_charged: number; total_paid: number; balance: number };
  payments: Array<{ date: string; amount: number; reference: string }>;
  note: string | null;
  generated_at: string;
}

export default function FeeStatementPage() {
  const { user } = useAuth();
  const [data, setData] = useState<FeeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId = user?.student_id;

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await reportsAPI.getFeeStatement(studentId) as FeeReport;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fee statement');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId]);

  if (loading) return (
    <ReportPage>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    </ReportPage>
  );

  if (error) return (
    <ReportPage>
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center">
        <ReportNotice icon={AlertCircle} tone="error">{error}</ReportNotice>
      </div>
    </ReportPage>
  );

  if (!data) return null;

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <ReportPage>
      <ReportToolbar
        maxWidth="max-w-3xl"
        title="Fee Statement"
        description="View billed items, payment history, and outstanding balances in a cleaner statement layout that prints well."
        eyebrow="Finance Reports"
      >
        <ReportActionButton onClick={() => window.print()} icon={Printer} variant="primary">
          Print / Download PDF
        </ReportActionButton>
      </ReportToolbar>

      <ReportSurface maxWidth="max-w-3xl">
        <div className="border-b border-white/10 pb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">Finance Statement</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.16em] text-white sm:text-3xl">{data.school.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{data.school.location}</p>
          <h2 className="mt-4 text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">Fee Statement</h2>
          {data.term.name ? <p className="mt-2 text-sm text-slate-400">{data.term.name}</p> : null}
        </div>

        <div className="mt-6 grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Student</span>
            <p className="mt-2 font-semibold text-slate-100">{data.student.name}</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Registration Number</span>
            <p className="mt-2 font-semibold text-slate-100">{data.student.registration_number}</p>
          </div>
        </div>

        {data.note ? (
          <div className="mt-6">
            <ReportNotice icon={Info} tone="info">{data.note}</ReportNotice>
          </div>
        ) : null}

        <div className="mt-6">
          <ReportSectionTitle>Billing Breakdown</ReportSectionTitle>
          <div className="overflow-x-auto rounded-[28px] border border-white/10">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800/90 text-white">
                  <th className="px-3 py-3 text-left">Description</th>
                  <th className="px-3 py-3 text-right">Charged</th>
                  <th className="px-3 py-3 text-right">Paid</th>
                  <th className="px-3 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.line_items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">No fee records available</td>
                  </tr>
                ) : data.line_items.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-slate-950/40' : 'bg-white/[0.02]'}>
                    <td className="px-3 py-3 text-slate-100">{item.description}</td>
                    <td className="px-3 py-3 text-right text-slate-100">{fmt(item.amount)}</td>
                    <td className="px-3 py-3 text-right text-emerald-200">{fmt(item.paid)}</td>
                    <td className={`px-3 py-3 text-right font-medium ${item.balance > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                      {fmt(item.balance)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-white/10 bg-slate-800/80 font-semibold">
                  <td className="px-3 py-3 text-white">Total</td>
                  <td className="px-3 py-3 text-right text-white">{fmt(data.summary.total_charged)}</td>
                  <td className="px-3 py-3 text-right text-emerald-200">{fmt(data.summary.total_paid)}</td>
                  <td className={`px-3 py-3 text-right ${data.summary.balance > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                    {fmt(data.summary.balance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {data.summary.balance > 0 ? (
          <div className="mt-6">
            <ReportNotice tone="warning">
              Outstanding Balance: {fmt(data.summary.balance)}. Please settle at the earliest convenience.
            </ReportNotice>
          </div>
        ) : null}

        {data.payments.length > 0 ? (
          <div className="mt-6">
            <ReportSectionTitle>Payment History</ReportSectionTitle>
            <div className="overflow-x-auto rounded-[28px] border border-white/10">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-800/90 text-white">
                    <th className="px-3 py-3 text-left">Date</th>
                    <th className="px-3 py-3 text-left">Reference</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p, i) => (
                    <tr key={i} className="border-t border-white/5 bg-slate-950/30">
                      <td className="px-3 py-3 text-slate-100">{p.date}</td>
                      <td className="px-3 py-3 text-slate-400">{p.reference}</td>
                      <td className="px-3 py-3 text-right font-medium text-emerald-200">{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-right text-xs text-slate-500">
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      </ReportSurface>

      <ReportPrintStyles />
    </ReportPage>
  );
}
