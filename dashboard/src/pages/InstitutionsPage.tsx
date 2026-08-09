import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Eye, Plus, X, Settings, Trash2 } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';
import AcademicStructurePreviewModal from '../components/admin/AcademicStructurePreviewModal';

type Institution = {
  id: string;
  code?: string;
  name: string;
  type: string;
  location: string;
  created_at: string | null;
};

type InstitutionForm = {
  id?: string;
  name: string;
  type: string;
  location: string;
};

type InstitutionFilters = {
  types: string[];
  locations: string[];
  can_view_master_data: boolean;
};

const emptyForm: InstitutionForm = { name: '', type: '', location: '' };

// ── Manage Types Modal ────────────────────────────────────────────────────────

function ManageTypesModal({
  token,
  onClose,
  onTypesChanged,
}: {
  token: string | null;
  onClose: () => void;
  onTypesChanged: (types: string[]) => void;
}) {
  const [types, setTypes] = useState<string[]>([]);
  const [newType, setNewType] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ types: string[] }>('/institutions/types', { token })
      .then((d) => { setTypes(d.types); setLoading(false); })
      .catch(() => { setError('Failed to load types'); setLoading(false); });
  }, [token]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const name = newType.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const d = await apiRequest<{ types: string[] }>('/institutions/types', {
        method: 'POST', token, body: { name },
      });
      setTypes(d.types);
      onTypesChanged(d.types);
      setNewType('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: string) => {
    setSaving(true);
    setError(null);
    try {
      const d = await apiRequest<{ types: string[] }>(
        `/institutions/types/${encodeURIComponent(type)}`,
        { method: 'DELETE', token }
      );
      setTypes(d.types);
      onTypesChanged(d.types);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete type');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-slate-100">Manage Institution Types</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
            <X className="text-slate-400" size={18} />
          </button>
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </p>
        )}

        <form onSubmit={handleAdd} className="flex gap-2 mb-5">
          <input
            type="text"
            placeholder="New type name..."
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={saving || !newType.trim()}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            <Plus size={15} /> Add
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {types.map((t) => (
              <li
                key={t}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 border border-slate-700"
              >
                <span className="text-sm text-slate-200">{t}</span>
                <button
                  onClick={() => handleDelete(t)}
                  disabled={saving}
                  className="p-1 text-slate-500 hover:text-red-400 transition disabled:opacity-40"
                  title="Delete type"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
            {types.length === 0 && (
              <li className="text-sm text-slate-500 px-3 py-2">No types defined yet.</li>
            )}
          </ul>
        )}

        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const InstitutionsPage = () => {
  const { token, user } = useAuth();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionTypes, setInstitutionTypes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<InstitutionForm>(emptyForm);
  const [previewInstitutionId, setPreviewInstitutionId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [canViewMasterData, setCanViewMasterData] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, filterData] = await Promise.all([
        apiRequest<Institution[]>('/institutions', { token }),
        apiRequest<InstitutionFilters>('/institutions/filters', { token })
          .catch(() => ({ types: [], locations: [], can_view_master_data: false })),
      ]);
      setInstitutions(data);
      setInstitutionTypes(filterData.types);
      setLocations(filterData.locations);
      setCanViewMasterData(filterData.can_view_master_data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load institutions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (token) loadData(); }, [token]);

  // Filtering runs client-side against the already-scoped list the API returned,
  // matching how Courses and Subjects filter — the dropdowns narrow what is on
  // screen, they never widen it past what this account is allowed to see.
  const filtered = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return institutions.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (locationFilter && item.location !== locationFilter) return false;
      if (!search) return true;
      return (
        item.name.toLowerCase().includes(search) ||
        (item.code ?? '').toLowerCase().includes(search) ||
        item.type.toLowerCase().includes(search) ||
        item.location.toLowerCase().includes(search)
      );
    });
  }, [institutions, searchTerm, typeFilter, locationFilter]);

  const hasActiveFilter = Boolean(searchTerm || typeFilter || locationFilter);
  const clearFilters = () => { setSearchTerm(''); setTypeFilter(''); setLocationFilter(''); };

  const tc = useTableControls(filtered);

  const openCreate = () => { setFormState(emptyForm); setIsModalOpen(true); };
  const openEdit = (item: Institution) => {
    setFormState({ id: item.id, name: item.name, type: item.type, location: item.location });
    setIsModalOpen(true);
  };
  const closeModal = () => { setIsModalOpen(false); setFormState(emptyForm); };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const payload = {
      name: formState.name.trim(),
      type: formState.type.trim(),
      location: formState.location.trim(),
    };
    try {
      if (formState.id) {
        await apiRequest(`/institutions/${formState.id}`, { method: 'PUT', token, body: payload });
      } else {
        await apiRequest('/institutions', { method: 'POST', token, body: payload });
      }
      closeModal();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save institution');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Institution) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/institutions/${item.id}`, { method: 'DELETE', token });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete institution');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canCreate = user?.permissions?.['institutions.create'] || user?.permissions?.['*'];
  const canUpdate = user?.permissions?.['institutions.update'] || user?.permissions?.['*'];
  const canDelete = user?.permissions?.['institutions.delete'] || user?.permissions?.['*'];
  const canPreviewCourses = Boolean(
    user?.permissions?.['*']
    || (user?.permissions?.['departments.read'] && user?.permissions?.['courses.read']),
  );

  if (!user?.permissions?.['institutions.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to view institutions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Institutions</h1>
          <p className="text-sm text-slate-500">Manage institutions and campuses.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={() => setIsTypesModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Settings size={15} /> Manage Types
            </button>
          )}
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Institution
            </button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-slate-700 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Search</label>
              <input
                type="text"
                placeholder="Search by ID, name, type, location..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full lg:w-56">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All types</option>
                {institutionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="w-full lg:w-56">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All locations</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {institutions.length} institution{institutions.length === 1 ? '' : 's'}
            {canViewMasterData
              ? ' across all institutions (master data access).'
              : ' within your institution.'}
          </p>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading institutions...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="ID" sortKey="code" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Name" sortKey="name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Type" sortKey="type" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Location" sortKey="location" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4"><span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">{item.code ?? '—'}</span></td>
                    <td className="px-6 py-4 font-medium text-slate-100">{item.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{item.location}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {canPreviewCourses ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300"
                            onClick={() => setPreviewInstitutionId(item.id)}
                          >
                            <Eye size={15} /> Preview courses
                          </button>
                        ) : null}
                        {canUpdate && (
                          <button
                            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                            onClick={() => handleDelete(item)}
                            disabled={isSubmitting}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {tc.paged.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No institutions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <TableFooter
          page={tc.page}
          totalPages={tc.totalPages}
          total={tc.total}
          pageSize={tc.pageSize}
          onPage={tc.setPage}
        />
      </div>

      <AcademicStructurePreviewModal
        open={Boolean(previewInstitutionId)}
        onClose={() => setPreviewInstitutionId('')}
        level="course"
        initialInstitutionId={previewInstitutionId}
      />

      {/* Add / Edit Institution Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-200">
                {formState.id ? 'Update Institution' : 'Create Institution'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-slate-800">
                <X className="text-slate-400" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="block w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Type dropdown */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-300">Type</label>
                    <button
                      type="button"
                      onClick={() => setIsTypesModalOpen(true)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                    >
                      <Settings size={11} /> Manage types
                    </button>
                  </div>
                  <select
                    required
                    value={formState.type}
                    onChange={(e) => setFormState({ ...formState, type: e.target.value })}
                    className="block w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Select type —</option>
                    {institutionTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={formState.location}
                    onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                    className="block w-full rounded-md border border-slate-700 bg-slate-800 text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-300">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save institution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Types Modal */}
      {isTypesModalOpen && (
        <ManageTypesModal
          token={token}
          onClose={() => setIsTypesModalOpen(false)}
          onTypesChanged={(types) => setInstitutionTypes(types)}
        />
      )}
    </div>
  );
};

export default InstitutionsPage;
