import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2, X, AlertCircle, Target } from 'lucide-react';
import { apiRequest } from '../api/client';
import { competenciesAPI, type Competency } from '../api/competencies';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/ProtectedRoute';
import type { Module } from '../types/backend';

/**
 * Authoring screen for competencies — the units mastery is graded against.
 *
 * Until this existed a competency could only be created by running a seed
 * script, so the Mastery Rate and Portfolio Completion tiles read 0% on any
 * institution that had not run one, with nothing in the product able to change
 * it. A competency belongs to a module, so the module is chosen first and
 * everything below is scoped to it.
 */

type FormState = {
  name: string;
  description: string;
  expected_outcome: string;
  mastery_threshold: string;
};

const emptyForm: FormState = {
  name: '',
  description: '',
  expected_outcome: '',
  mastery_threshold: '100',
};

const CompetenciesPage = () => {
  const { user, token } = useAuth();
  // Competency definitions are curriculum, not marking: trainers hold
  // `competencies.read` and grade against them, while changing them needs the
  // create/update/delete keys an administrator grants from the Roles screen.
  const canCreate = hasPermission(user, 'competencies.create');
  const canEdit = hasPermission(user, 'competencies.update');
  const canDelete = hasPermission(user, 'competencies.delete');
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Module[]>('/modules', { token })
      .then((data) => setModules(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load modules'));
  }, [token]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await competenciesAPI.list(moduleId || undefined);
      setCompetencies(data.competencies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load competencies');
      setCompetencies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [moduleId]);

  const selectedModuleName = useMemo(
    () => modules.find((module) => module.id === moduleId)?.name ?? null,
    [modules, moduleId],
  );

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (competency: Competency) => {
    setEditId(competency.id);
    setForm({
      name: competency.name,
      description: competency.description ?? '',
      expected_outcome: competency.expected_outcome ?? '',
      mastery_threshold: String(competency.mastery_threshold ?? 100),
    });
    setShowForm(true);
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!form.name.trim()) {
      setError('Enter a competency name.');
      return;
    }
    // Creating needs a module to attach to; editing already has one.
    if (!editId && !moduleId) {
      setError('Choose the module this competency belongs to.');
      return;
    }
    const threshold = Number(form.mastery_threshold);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) {
      setError('Mastery threshold must be a number between 1 and 100.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        expected_outcome: form.expected_outcome.trim() || null,
        mastery_threshold: threshold,
      };
      if (editId) {
        await competenciesAPI.update(editId, body);
        setNotice('Competency updated.');
      } else {
        await competenciesAPI.create({ ...body, module_id: moduleId });
        setNotice('Competency created. Link an assessment to it so marks reach the mastery heatmap.');
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the competency');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (competency: Competency) => {
    if (!window.confirm(`Delete "${competency.name}"? This cannot be undone from this page.`)) return;
    try {
      setDeletingId(competency.id);
      setError(null);
      await competenciesAPI.remove(competency.id);
      setNotice('Competency deleted.');
      await load();
    } catch (err) {
      // The API refuses while assessments or evidence still point at it, and
      // says how many — pass that straight through rather than a generic line.
      setError(err instanceof Error ? err.message : 'Could not delete the competency');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Competencies</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            The units learners are graded against. Mastery Rate counts a learner as high-mastery per
            competency, and Portfolio Completion counts evidence submitted against them — both stay at
            0% until competencies exist and assessments are linked to them.
          </p>
          {!canCreate && !canEdit && !canDelete ? (
            <p className="mt-2 text-xs text-slate-500">
              You have view-only access — competencies are maintained by your administrator.
            </p>
          ) : null}
        </div>
        {canCreate ? (
          <button
            onClick={openCreate}
            disabled={!moduleId}
            title={moduleId ? undefined : 'Choose a module first'}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/90 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} /> New Competency
          </button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Module</label>
        <select
          value={moduleId}
          onChange={(event) => setModuleId(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50 md:max-w-xl"
        >
          <option value="">All modules</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>{module.name}</option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">
          A competency belongs to one module and applies to every subject under it.
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

      {showForm ? (
        <form onSubmit={save} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              {editId ? 'Edit Competency' : `New Competency${selectedModuleName ? ` — ${selectedModuleName}` : ''}`}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null); }} className="text-slate-400 hover:text-slate-200">
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              placeholder="Competency name *"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
            />
            <input
              type="number"
              min={1}
              max={100}
              placeholder="Mastery threshold %"
              value={form.mastery_threshold}
              onChange={(event) => setForm({ ...form, mastery_threshold: event.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
            />
            <input
              placeholder="Expected outcome (optional)"
              value={form.expected_outcome}
              onChange={(event) => setForm({ ...form, expected_outcome: event.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50 md:col-span-2"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50 md:col-span-2"
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-500/90 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Competency'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditId(null); }}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-10 text-center text-slate-400">Loading competencies…</div>
      ) : competencies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center">
          <Target size={28} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-300">No competencies yet{selectedModuleName ? ` for ${selectedModuleName}` : ''}.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Mastery Rate and Portfolio Completion are measured per competency, so both report nothing
            until at least one exists here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3">Competency</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3 text-center">Threshold</th>
                <th className="px-4 py-3 text-center">Assessments</th>
                <th className="px-4 py-3 text-center">Evidence</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {competencies.map((competency) => (
                <tr key={competency.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-100">{competency.name}</p>
                    {competency.expected_outcome ? (
                      <p className="mt-1 text-xs text-slate-500">{competency.expected_outcome}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{competency.module_name ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{competency.mastery_threshold}%</td>
                  <td className="px-4 py-3 text-center">
                    {competency.assessment_count ? (
                      <span className="text-slate-300">{competency.assessment_count}</span>
                    ) : (
                      // Without a linked assessment no mark can ever reach the
                      // heatmap through this competency, so it is called out.
                      <span className="text-xs text-amber-300" title="No assessment is linked, so no marks count toward mastery">
                        none linked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300">{competency.evidence_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {canEdit ? (
                        <button
                          onClick={() => openEdit(competency)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          onClick={() => remove(competency)}
                          disabled={deletingId === competency.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <Trash2 size={13} /> {deletingId === competency.id ? 'Deleting…' : 'Delete'}
                        </button>
                      ) : null}
                      {!canEdit && !canDelete ? (
                        <span className="text-xs text-slate-500">View only</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CompetenciesPage;
