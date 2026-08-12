import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, CheckCircle2, AlertCircle, FileText, ShieldCheck } from 'lucide-react';
import { portfolioEvidenceAPI, type EvidenceItem, type EvidenceRequirement } from '../api/competencies';
import { resolveApiUrl } from '../api/client';

/**
 * Where a learner submits portfolio evidence.
 *
 * Portfolio Completion is evidence submitted over competencies required, but
 * nothing in the product could create a piece of evidence — rows existed only
 * where a seed script had put them, so the tile reported 0% describing the
 * missing screen rather than the learner. The requirements list mirrors how
 * the metric counts, so what is shown here is exactly what is measured.
 */

const PortfolioEvidencePage = () => {
  const [requirements, setRequirements] = useState<EvidenceRequirement[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // One hidden input per competency, so "Upload" on a row opens that row's picker.
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [reqs, items] = await Promise.all([
        portfolioEvidenceAPI.requirements(),
        portfolioEvidenceAPI.list(),
      ]);
      setRequirements(reqs.items ?? []);
      setEvidence(items.evidence ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your portfolio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const upload = async (competencyId: string, file: File | undefined) => {
    if (!file) return;
    try {
      setUploadingId(competencyId);
      setError(null);
      await portfolioEvidenceAPI.upload(competencyId, file);
      setNotice(`Uploaded ${file.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that file');
    } finally {
      setUploadingId(null);
    }
  };

  const remove = async (item: EvidenceItem) => {
    if (!window.confirm(`Withdraw ${item.file_name ?? 'this evidence'}?`)) return;
    try {
      setDeletingId(item.id);
      setError(null);
      await portfolioEvidenceAPI.remove(item.id);
      setNotice('Evidence withdrawn.');
      await load();
    } catch (err) {
      // Verified evidence belongs to the assessor's record, and the API says so.
      setError(err instanceof Error ? err.message : 'Could not withdraw that evidence');
    } finally {
      setDeletingId(null);
    }
  };

  const submitted = requirements.filter((item) => item.submitted).length;
  const completion = requirements.length ? Math.round((submitted / requirements.length) * 100) : 0;

  if (loading) {
    return <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-10 text-center text-slate-400">Loading your portfolio…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">My Portfolio</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Upload evidence for each competency on your subjects. Your portfolio completion is measured
          from exactly this list.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="underline underline-offset-4">Dismiss</button>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="underline underline-offset-4">Dismiss</button>
        </div>
      ) : null}

      {requirements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center">
          <FileText size={28} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-300">Nothing is required of you yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            No competencies have been defined for your subjects, so there is no portfolio to build.
            Your trainer sets these up.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
              <span className="font-medium">Portfolio completion</span>
              <span>{completion}% ({submitted}/{requirements.length})</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-800">
              <div
                className={`h-3 rounded-full transition-all ${completion >= 80 ? 'bg-emerald-500' : completion >= 40 ? 'bg-cyan-500' : 'bg-amber-500'}`}
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {requirements.map((requirement) => {
              const files = evidence.filter((item) => item.competency_id === requirement.competency_id);
              return (
                <div key={requirement.competency_id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {requirement.submitted
                          ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                          : <span className="h-4 w-4 shrink-0 rounded-full border border-slate-600" />}
                        <p className="font-medium text-slate-100">{requirement.competency_name}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {requirement.module_name ?? '—'}
                        {requirement.expected_outcome ? ` · ${requirement.expected_outcome}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <input
                        ref={(element) => { inputs.current[requirement.competency_id] = element; }}
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          upload(requirement.competency_id, event.target.files?.[0]);
                          // Cleared so re-picking the same file fires onChange again.
                          event.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => inputs.current[requirement.competency_id]?.click()}
                        disabled={uploadingId === requirement.competency_id}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                      >
                        <Upload size={15} />
                        {uploadingId === requirement.competency_id ? 'Uploading…' : 'Upload Evidence'}
                      </button>
                    </div>
                  </div>

                  {files.length > 0 ? (
                    <ul className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                      {files.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <a
                            href={resolveApiUrl(item.file_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 truncate text-cyan-300 underline underline-offset-4"
                          >
                            {item.file_name ?? 'Evidence file'}
                          </a>
                          {item.verified ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-200">
                              <ShieldCheck size={12} /> Verified
                            </span>
                          ) : null}
                          <button
                            onClick={() => remove(item)}
                            disabled={deletingId === item.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 size={12} /> {deletingId === item.id ? 'Removing…' : 'Withdraw'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default PortfolioEvidencePage;
