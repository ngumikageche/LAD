import { useEffect, useState } from 'react';
import { CheckCircle2, Printer, ShieldCheck, XCircle } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Compliance = {
  minimum_attendance: number;
  summary: { learners: number; ready: number; not_ready: number; trainer_compliance: number; trainers: number };
  learners: Array<{
    student_id: string; student_name: string; registration_number: string; attendance_rate: number;
    subjects_expected: number; subjects_with_formative_scores: number; ready_for_final_assessment: boolean;
  }>;
  trainers: Array<{
    trainer_id: string; trainer_name: string; assigned_subjects: number; attendance_sessions: number;
    scored_records: number; marked_script_files: number; practical_evidence_files: number;
    oral_evidence_files: number; compliant: boolean;
  }>;
};

export default function AdminCompliancePage() {
  const { token } = useAuth();
  const [data, setData] = useState<Compliance | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest<Compliance>('/reports/admin/compliance', { token }).then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load compliance'));
  }, [token]);
  if (error) return <div className="rounded-xl bg-red-500/10 p-4 text-red-200">{error}</div>;
  if (!data) return <div className="p-10 text-slate-400">Loading compliance report…</div>;
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="flex items-center gap-3 text-3xl font-bold text-white"><ShieldCheck className="text-emerald-300" /> Compliance & Readiness</h1><p className="mt-2 text-slate-400">Readiness requires at least {data.minimum_attendance}% attendance and formative scores in every enrolled subject.</p></div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-slate-200"><Printer size={16} /> Print</button>
      </header>
      <div className="grid gap-4 sm:grid-cols-4">
        {Object.entries(data.summary).map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-xs uppercase text-slate-500">{label.replaceAll('_', ' ')}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p></div>)}
      </div>
      <Table title="Learner readiness" headers={['Learner', 'Attendance', 'Formative coverage', 'Ready']}>
        {data.learners.map((row) => <tr key={row.student_id} className="border-t border-slate-800"><td className="p-3"><p className="font-semibold text-white">{row.student_name}</p><p className="text-xs text-slate-500">{row.registration_number}</p></td><td className="p-3 text-slate-300">{row.attendance_rate}%</td><td className="p-3 text-slate-300">{row.subjects_with_formative_scores}/{row.subjects_expected} subjects</td><td className="p-3">{row.ready_for_final_assessment ? <CheckCircle2 className="text-emerald-400" /> : <XCircle className="text-rose-400" />}</td></tr>)}
      </Table>
      <Table title="Trainer quality-assurance evidence" headers={['Trainer', 'Attendance', 'Scores', 'Marked scripts', 'Practical / oral', 'Compliant']}>
        {data.trainers.map((row) => <tr key={row.trainer_id} className="border-t border-slate-800"><td className="p-3 font-semibold text-white">{row.trainer_name}</td><td className="p-3 text-slate-300">{row.attendance_sessions}</td><td className="p-3 text-slate-300">{row.scored_records}</td><td className="p-3 text-slate-300">{row.marked_script_files}</td><td className="p-3 text-slate-300">{row.practical_evidence_files} / {row.oral_evidence_files}</td><td className="p-3">{row.compliant ? <CheckCircle2 className="text-emerald-400" /> : <XCircle className="text-rose-400" />}</td></tr>)}
      </Table>
    </div>
  );
}

function Table({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"><h2 className="p-5 text-xl font-bold text-white">{title}</h2><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-800 text-left text-xs uppercase text-slate-400"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>;
}
