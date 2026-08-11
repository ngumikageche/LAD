import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Term = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  /** Marks visible to this account that fall in the term. */
  scores_in_scope?: number;
};

type TermsResponse = {
  terms: Term[];
  total: number;
  active_term_id: string | null;
  scope: 'all' | 'assigned';
};

type TermForm = { id?: string; name: string; start_date: string; end_date: string };

const emptyForm: TermForm = { name: '', start_date: '', end_date: '' };

/** `2026-01-15T00:00:00` → `2026-01-15`, which is what a date input wants. */
const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : '');

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export default function TermsPage() {
  const { token, user } = useAuth();
  const [terms, setTerms] = useState<Term[]>([]);
  const [scope, setScope] = useState<'all' | 'assigned'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<TermForm>(emptyForm);
  const [busyTermId, setBusyTermId] = useState<string | null>(null);

  const canRead = Boolean(user?.permissions?.['terms.read'] || user?.permissions?.['*']);
  const canCreate = Boolean(user?.permissions?.['terms.create'] || user?.permissions?.['*']);
  const canUpdate = Boolean(user?.permissions?.['terms.update'] || user?.permissions?.['*']);
  const canDelete = Boolean(user?.permissions?.['terms.delete'] || user?.permissions?.['*']);

  const loadTerms = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<TermsResponse>('/terms', { token });
      setTerms(data.terms ?? []);
      setScope(data.scope ?? 'all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terms');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (token && canRead) loadTerms(); }, [token, canRead]);

  const withMarks = useMemo(() => terms.filter((t) => (t.scores_in_scope ?? 0) > 0), [terms]);

  const openCreate = () => { setFormState(emptyForm); setIsModalOpen(true); };
  const openEdit = (term: Term) => {
    setFormState({
      id: term.id,
      name: term.name,
      start_date: toDateInput(term.start_date),
      end_date: toDateInput(term.end_date),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const body = {
      name: formState.name.trim(),
      start_date: formState.start_date,
      end_date: formState.end_date,
    };
    try {
      if (formState.id) {
        await apiRequest(`/terms/${formState.id}`, { method: 'PUT', token, body });
      } else {
        await apiRequest('/terms', { method: 'POST', token, body });
      }
      setIsModalOpen(false);
      setFormState(emptyForm);
      await loadTerms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save term');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (term: Term) => {
    setBusyTermId(term.id);
    setError(null);
    try {
      await apiRequest(`/terms/${term.id}/activate`, { method: 'POST', token });
      setNotice(`${term.name} is now the current term. Reports default to it.`);
      await loadTerms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set the current term');
    } finally {
      setBusyTermId(null);
    }
  };

  const handleDelete = async (term: Term) => {
    setBusyTermId(term.id);
    setError(null);
    try {
      await apiRequest(`/terms/${term.id}`, { method: 'DELETE', token });
      await loadTerms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete term');
    } finally {
      setBusyTermId(null);
    }
  };

  if (!canRead) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to view academic terms.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Academic Terms</h1>
          <p className="text-sm text-slate-500">
            Every term on the system, and how many marks each one holds for you.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
          >
            <Plus size={16} /> Add Term
          </button>
        )}
      </div>

      {/* The reason this screen exists: a report saying "no marks in this term"
          does not tell you which term does have them. */}
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm text-slate-300">
        {isLoading ? (
          'Checking which terms hold your marks…'
        ) : withMarks.length === 0 ? (
          <>No marks have been recorded against any term{scope === 'assigned' ? ' in your scope' : ''} yet.</>
        ) : (
          <>
            Marks {scope === 'assigned' ? 'in your scope ' : ''}appear in{' '}
            <strong className="text-cyan-200">
              {withMarks.map((t) => t.name).join(', ')}
            </strong>
            . Reports default to the current term — switch the term filter on a report to see the others.
          </>
        )}
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading terms...</div>
        ) : terms.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No terms have been created yet.
            {canCreate ? ' Add one to start grouping marks and reports by period.' : ''}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-700 bg-slate-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Term</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Starts</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Ends</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Marks {scope === 'assigned' ? 'in your scope' : 'recorded'}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {terms.map((term) => (
                  <tr key={term.id} className="transition-colors hover:bg-slate-800/60">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={15} className="shrink-0 text-slate-500" />
                        <span className="font-medium text-slate-100">{term.name}</span>
                        {term.is_active && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                            <CheckCircle2 size={11} /> Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{formatDate(term.start_date)}</td>
                    <td className="px-6 py-4 text-slate-400">{formatDate(term.end_date)}</td>
                    <td className="px-6 py-4">
                      {term.scores_in_scope === undefined ? (
                        <span className="text-slate-500">—</span>
                      ) : term.scores_in_scope > 0 ? (
                        <span className="font-semibold text-slate-100">{term.scores_in_scope}</span>
                      ) : (
                        <span className="text-slate-500">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-sm font-medium">
                        {canUpdate && !term.is_active && (
                          <button
                            onClick={() => handleActivate(term)}
                            disabled={busyTermId === term.id}
                            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                          >
                            Set as current
                          </button>
                        )}
                        {canUpdate && (
                          <button onClick={() => openEdit(term)} className="text-indigo-400 hover:text-indigo-300">
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(term)}
                            disabled={busyTermId === term.id}
                            className="text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-200">
                {formState.id ? 'Update Term' : 'Create Term'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-800">
                <X className="text-slate-400" size={18} />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Term 1 2026"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Marks uploaded with a matching term label are grouped under it.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Start date</label>
                  <input
                    type="date"
                    required
                    value={formState.start_date}
                    onChange={(e) => setFormState({ ...formState, start_date: e.target.value })}
                    className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">End date</label>
                  <input
                    type="date"
                    required
                    value={formState.end_date}
                    onChange={(e) => setFormState({ ...formState, end_date: e.target.value })}
                    className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save term'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
