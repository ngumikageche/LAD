import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, HeartPulse, Paperclip, Upload } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type ReportAttachment = {
  id: string;
  kind: 'handwritten_feedback' | 'supporting_document' | 'student_response';
  file_name: string;
  file_url: string;
  file_size: number;
  content_type: string;
  uploaded_by_name?: string;
  uploaded_by_role?: 'student' | 'trainer' | 'admin';
  uploaded_at?: string;
};

type DisciplineIncident = {
  id: string;
  title: string;
  category: string;
  incident_date: string | null;
  subject_name: string | null;
  recorded_by: string | null;
  notes: string | null;
  action_taken: string | null;
  attachments: ReportAttachment[];
  created_at: string | null;
};

type DisciplineReportResponse = {
  student_id: string;
  student_name: string;
  incidents: DisciplineIncident[];
  generated_at: string;
};

const FILE_ACCEPT = '.pdf,.doc,.docx,.odt,.txt,.png,.jpg,.jpeg,.webp,.heic,.heif';

export default function StudentDisciplinaryRecordsPage() {
  const { user, token } = useAuth();
  const [report, setReport] = useState<DisciplineReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingReportId, setUploadingReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadReport = async () => {
    if (!user?.student_id) {
      setError('Student profile not found.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<DisciplineReportResponse>(
        `/reports/student/${user.student_id}/discipline`,
        { token },
      );
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load disciplinary records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && user) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.student_id]);

  const uploadResponse = async (reportId: string, file: File) => {
    if (!user?.student_id) return;
    const body = new FormData();
    body.append('file', file);
    try {
      setUploadingReportId(reportId);
      setError(null);
      await apiRequest(
        `/trainers/students/${user.student_id}/reports/${reportId}/attachments`,
        { method: 'POST', token, body },
      );
      await loadReport();
      setSuccess('Your apology/response document was uploaded successfully.');
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload your response');
    } finally {
      setUploadingReportId(null);
    }
  };

  const openAttachment = async (fileUrl: string) => {
    try {
      const blob = await apiRequest<Blob>(fileUrl, { token, responseType: 'blob' });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open document');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-rose-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-100">
          <HeartPulse className="text-rose-400" />
          My Disciplinary Records
        </h1>
        <p className="mt-2 text-slate-400">
          Review incidents and upload an apology letter or supporting response for a specific record.
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
          <CheckCircle2 size={18} />
          {success}
        </div>
      ) : null}

      <div className="grid gap-5">
        {(report?.incidents ?? []).map((incident) => (
          <article key={incident.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">
                  {incident.category}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-100">{incident.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {incident.incident_date ?? 'Unknown date'} · {incident.subject_name ?? 'General'} ·{' '}
                  {incident.recorded_by ?? 'Institution'}
                </p>
              </div>
              <FileText className="text-slate-600" />
            </div>

            <p className="mt-5 whitespace-pre-wrap text-sm text-slate-300">
              {incident.notes || 'No notes provided.'}
            </p>
            {incident.action_taken ? (
              <p className="mt-3 text-sm text-rose-300">
                Action taken: {incident.action_taken}
              </p>
            ) : null}

            {(incident.attachments ?? []).length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Documents
                </p>
                <div className="flex flex-wrap gap-2">
                  {(incident.attachments ?? []).map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => openAttachment(attachment.file_url)}
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200"
                    >
                      <Paperclip size={15} />
                      {attachment.file_name}
                      {attachment.kind === 'student_response' ? ' · My response' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-slate-800 pt-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700">
                <Upload size={16} />
                {uploadingReportId === incident.id ? 'Uploading…' : 'Upload apology/response'}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingReportId === incident.id}
                  accept={FILE_ACCEPT}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadResponse(incident.id, file);
                    event.target.value = '';
                  }}
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                PDF, Word, text, or image · maximum 10 MB
              </p>
            </div>
          </article>
        ))}

        {(report?.incidents ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            You have no disciplinary records.
          </div>
        ) : null}
      </div>
    </div>
  );
}
