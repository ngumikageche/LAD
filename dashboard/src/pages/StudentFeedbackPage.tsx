import { useEffect, useState } from 'react';
import { Image, MessageSquareText } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type FeedbackReport = {
  id: string; title: string; body: string; report_type: string; subject_name: string | null;
  trainer_name: string | null; created_at: string | null;
  attachments: Array<{ id: string; file_name: string; file_url: string; kind: string }>;
};

export default function StudentFeedbackPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest<FeedbackReport[]>('/api/v1/student/feedback-reports', { token }).then(setReports).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load feedback'));
  }, [token]);
  const openAttachment = async (url: string) => {
    try {
      const blob = await apiRequest<Blob>(url, { token, responseType: 'blob' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open attachment');
    }
  };
  return <div className="space-y-6"><header><h1 className="flex items-center gap-3 text-3xl font-bold text-white"><MessageSquareText className="text-cyan-300" /> Trainer Feedback</h1><p className="mt-2 text-slate-400">Written and photographed remarks shared by your trainers.</p></header>{error ? <div className="rounded-xl bg-red-500/10 p-4 text-red-200">{error}</div> : null}<div className="grid gap-5">{reports.map((report) => <article key={report.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-cyan-300">{report.report_type}</p><h2 className="mt-1 text-xl font-bold text-white">{report.title}</h2><p className="mt-1 text-xs text-slate-500">{report.subject_name ?? 'General'} • {report.trainer_name ?? 'Institution'} • {report.created_at ? new Date(report.created_at).toLocaleString() : ''}</p></div></div><p className="mt-5 whitespace-pre-line text-slate-300">{report.body}</p>{report.attachments.map((attachment) => <button key={attachment.id} onClick={() => openAttachment(attachment.file_url)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200"><Image size={16} /> View handwritten feedback: {attachment.file_name}</button>)}</article>)}{reports.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">No trainer feedback has been shared yet.</div> : null}</div></div>;
}
