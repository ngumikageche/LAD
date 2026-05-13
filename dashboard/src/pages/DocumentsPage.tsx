import { useEffect, useMemo, useState } from 'react';
import {
  Upload, Trash2, Send, FileText, File, X, AlertCircle, CheckCircle2, Search,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';

interface Document {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploader_name: string | null;
  created_at: string | null;
}

interface Module {
  id: string;
  name: string;
  course_name: string | null;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string | null) {
  const t = (type ?? '').toLowerCase();
  if (['pdf'].includes(t)) return <FileText size={16} className="text-red-400" />;
  if (['doc', 'docx'].includes(t)) return <FileText size={16} className="text-blue-400" />;
  if (['xls', 'xlsx', 'csv'].includes(t)) return <FileText size={16} className="text-green-400" />;
  if (['ppt', 'pptx'].includes(t)) return <FileText size={16} className="text-orange-400" />;
  if (['png', 'jpg', 'jpeg', 'gif'].includes(t)) return <File size={16} className="text-purple-400" />;
  return <File size={16} className="text-slate-400" />;
}

// ── Send to Module Modal ──────────────────────────────────────────────────────

function SendModal({
  doc,
  token,
  onClose,
}: {
  doc: Document;
  token: string | null;
  onClose: () => void;
}) {
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/documents/modules`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { setModules(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const handleSend = async () => {
    if (!selectedModule) return;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/documents/${doc.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ module_id: selectedModule }),
      });
      const d = await r.json();
      if (r.ok) {
        setResult({ ok: true, msg: d.message });
      } else {
        setResult({ ok: false, msg: d.error ?? 'Failed to send' });
      }
    } catch {
      setResult({ ok: false, msg: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Send size={18} className="text-indigo-400" /> Send Document
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-sm font-medium text-slate-200">{doc.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{doc.file_name}</p>
        </div>

        <label className="block text-sm font-medium text-slate-300 mb-1">
          Select Module
        </label>
        {loading ? (
          <p className="text-sm text-slate-400">Loading modules...</p>
        ) : (
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          >
            <option value="">— Select a module —</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.course_name ? ` (${m.course_name})` : ''}
              </option>
            ))}
          </select>
        )}

        {result && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-4 ${
            result.ok
              ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}>
            {result.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {result.msg}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700"
          >
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button
              onClick={handleSend}
              disabled={sending || !selectedModule}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              <Send size={14} />
              {sending ? 'Sending...' : 'Send to Students'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  token,
  onClose,
  onUploaded,
}: {
  token: string | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (r.ok) {
        onUploaded();
        onClose();
      } else {
        setError(d.error ?? 'Upload failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Upload size={18} className="text-indigo-400" /> Upload Document
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Week 3 Lecture Notes"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Optional description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">File *</label>
            <div
              className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 transition"
              onClick={() => document.getElementById('doc-file-input')?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-slate-200">
                  {fileIcon(file.name.split('.').pop() ?? null)}
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-slate-500">({formatBytes(file.size)})</span>
                </div>
              ) : (
                <div className="text-slate-500 text-sm">
                  <Upload size={24} className="mx-auto mb-2 text-slate-600" />
                  Click to select a file
                  <p className="text-xs mt-1">PDF, DOC, XLS, PPT, images, ZIP…</p>
                </div>
              )}
              <input
                id="doc-file-input"
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              <Upload size={14} />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { token, user } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [sendDoc, setSendDoc] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canCreate = user?.permissions?.['documents.create'] || user?.permissions?.['*'];
  const canDelete = user?.permissions?.['documents.delete'] || user?.permissions?.['*'];

  const loadDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setDocs(Array.isArray(d) ? d : []);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) loadDocs(); }, [token]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q) ||
        (d.file_type ?? '').toLowerCase().includes(q) ||
        (d.uploader_name ?? '').toLowerCase().includes(q)
    );
  }, [docs, search]);

  const tc = useTableControls(filtered);

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    setDeleting(doc.id);
    try {
      await fetch(`${API}/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadDocs();
    } catch {
      setError('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Documents</h1>
          <p className="text-sm text-slate-500">Upload and distribute documents to module students.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Upload size={16} /> Upload Document
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <span className="text-xs text-slate-500">{tc.total} document{tc.total !== 1 ? 's' : ''}</span>
        </div>

        {error && (
          <div className="mx-5 mt-4 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Loading documents...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Title" sortKey="title" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="File" sortKey="file_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Type" sortKey="file_type" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Size" sortKey="file_size" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Uploaded By" sortKey="uploader_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Date" sortKey="created_at" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-100">{doc.title}</p>
                      {doc.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{doc.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`${API}${doc.file_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition"
                      >
                        {fileIcon(doc.file_type)}
                        <span className="truncate max-w-[160px]">{doc.file_name}</span>
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      {doc.file_type ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300 uppercase">
                          {doc.file_type}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{formatBytes(doc.file_size)}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{doc.uploader_name ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {canCreate && (
                          <button
                            onClick={() => setSendDoc(doc)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/25 transition"
                          >
                            <Send size={12} /> Send
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={deleting === doc.id}
                            className="p-1.5 text-slate-500 hover:text-red-400 transition disabled:opacity-40"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {tc.paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No documents uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
      </div>

      {showUpload && (
        <UploadModal token={token} onClose={() => setShowUpload(false)} onUploaded={loadDocs} />
      )}
      {sendDoc && (
        <SendModal doc={sendDoc} token={token} onClose={() => setSendDoc(null)} />
      )}
    </div>
  );
}
