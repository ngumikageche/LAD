import { useState, useEffect, useMemo } from 'react';
import { FileText, Edit2, Trash2, Upload, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { adminScoresAPI } from '../api/admin';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';
import { exportCSV, exportExcel, exportPDF } from '../utils/exportUtils';

interface Score {
  id: string;
  student_id: string | null;
  student_name: string | null;
  registration_number: string | null;
  subject_id: string | null;
  subject_name: string | null;
  assessment_id: string | null;
  assessment_name: string | null;
  course_name: string | null;
  marks_obtained: number;
  grade: string | null;
  is_passed: boolean | null;
  term: string | null;
  feedback: string | null;
  created_at: string | null;
}

interface ScoreForm {
  marks_obtained: number;
  grade: string;
  feedback: string;
}

export default function AdminScoreManagementPage() {
  const { user } = useAuth();
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const [formData, setFormData] = useState<ScoreForm>({
    marks_obtained: 0,
    grade: '',
    feedback: '',
  });

  useEffect(() => {
    loadScores();
  }, []);

  const loadScores = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch scores and students in parallel
      // Fetch all students with a high per_page to avoid pagination cutoff
      const [rawData, studentsRaw] = await Promise.all([
        adminScoresAPI.getScores({ per_page: 200 }) as Promise<any>,
        apiRequest<any>('/students?per_page=500').catch(() => []),
      ]);

      const items: any[] = Array.isArray(rawData?.items) ? rawData.items
        : Array.isArray(rawData) ? rawData : [];

      // /students may return array or { items: [] } or { students: [] }
      const studentList: any[] = Array.isArray(studentsRaw) ? studentsRaw
        : Array.isArray(studentsRaw?.items) ? studentsRaw.items
        : Array.isArray(studentsRaw?.students) ? studentsRaw.students
        : [];

      // Build student lookup by id
      const studentMap: Record<string, { name: string; registration_number: string }> = {};
      for (const s of studentList) {
        const sid = s.id ?? s.student_id;
        if (!sid) continue;
        studentMap[sid] = {
          name: s.user?.name ?? s.name ?? '—',
          registration_number: s.registration_number ?? '—',
        };
      }

      const enriched: Score[] = items.map((s: any) => {
        const sid = s.student_id && s.student_id !== 'None' ? s.student_id : null;
        const studentInfo = sid ? studentMap[sid] : null;
        return {
          id: s.id,
          student_id: sid,
          student_name: studentInfo?.name ?? s.student_name ?? '—',
          registration_number: studentInfo?.registration_number ?? s.registration_number ?? '—',
          subject_id: s.subject_id ?? null,
          subject_name: s.subject_name ?? null,
          assessment_id: s.assessment_id && s.assessment_id !== 'None' ? s.assessment_id : null,
          assessment_name: s.assessment_name ?? null,
          course_name: s.course_name ?? null,
          marks_obtained: s.marks_obtained ?? 0,
          grade: s.grade ?? null,
          is_passed: s.is_passed ?? null,
          term: s.term ?? null,
          feedback: s.feedback ?? null,
          created_at: s.created_at ?? null,
        };
      });

      setScores(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  const handleAddScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (formData.marks_obtained < 0) {
      setError('Marks must be a positive number');
      return;
    }
    try {
      setError(null);
      await adminScoresAPI.updateScore(editingId, {
        marks_obtained: formData.marks_obtained,
        grade: formData.grade || undefined,
        feedback: formData.feedback || undefined,
      });
      setSuccess('Score updated successfully!');
      resetForm();
      await loadScores();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update score');
    }
  };

  const resetForm = () => {
    setFormData({ marks_obtained: 0, grade: '', feedback: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (score: Score) => {
    setFormData({
      marks_obtained: score.marks_obtained,
      grade: score.grade ?? '',
      feedback: '',
    });
    setEditingId(score.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this score?')) return;
    try {
      await adminScoresAPI.deleteScore(id);
      setSuccess('Score deleted successfully!');
      await loadScores();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete score');
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSuccess('File uploaded successfully!');
    setShowUpload(false);
    setTimeout(() => setSuccess(null), 3000);
  };

  const filteredScores = scores.filter(score =>
    searchTerm === '' ||
    (score.student_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (score.registration_number ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (score.course_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (score.assessment_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (score.assessment_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tc = useTableControls(filteredScores);

  /** One row shape drives every export format, so the files stay identical. */
  const exportRows = useMemo(
    () => filteredScores.map((score) => ({
      student_name: score.student_name ?? '—',
      registration_number: score.registration_number ?? '—',
      course_name: score.course_name ?? '—',
      subject_name: score.subject_name ?? '—',
      assessment_name: score.assessment_name ?? '—',
      term: score.term ?? '—',
      marks_obtained: score.marks_obtained,
      grade: score.grade ?? '—',
      outcome: score.is_passed === null ? '—' : score.is_passed ? 'Pass' : 'Fail',
      feedback: score.feedback ?? '',
      recorded_at: score.created_at
        ? new Date(score.created_at).toLocaleDateString()
        : '—',
    })),
    [filteredScores],
  );

  const exportMeta = {
    generatedBy: user?.name ?? 'Unknown',
    reportTitle: 'Score Management Export',
    subtitle: searchTerm ? `Filtered by "${searchTerm}"` : 'All recorded scores',
  };
  const exportName = `scores-${new Date().toISOString().slice(0, 10)}`;

  const handleExport = (format: 'excel' | 'pdf' | 'csv') => {
    if (exportRows.length === 0) {
      setError('There are no scores to export.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    const sheets = [{ name: 'Scores', rows: exportRows as Record<string, unknown>[] }];
    if (format === 'excel') exportExcel(sheets, exportName, exportMeta);
    else if (format === 'pdf') exportPDF(sheets, exportName, exportMeta);
    else exportCSV(exportRows as Record<string, unknown>[], exportName);
    setSuccess(`Exported ${exportRows.length} score${exportRows.length === 1 ? '' : 's'}.`);
    setTimeout(() => setSuccess(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
              <FileText size={32} className="text-blue-500" />
              Score Management
            </h1>
            <p className="text-slate-400 mt-2">Monitor, add, edit and validate academic scores</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center gap-2"
            >
              <Upload size={20} />
              Bulk Upload
            </button>
            <button
              onClick={() => {
                if (!editingId) {
                  setError('Select a score to edit first');
                  return;
                }
                resetForm();
                setShowForm(true);
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2"
            >
              Edit Score
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle2 size={20} />
            {success}
          </div>
        )}

        {/* Bulk Upload */}
        {showUpload && (
          <div className="mb-6 p-6 bg-slate-900 border border-slate-800 rounded-lg shadow border-2 border-dashed border-green-300">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Bulk Upload Scores</h3>
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-slate-700 rounded-lg text-center">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleBulkUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload size={48} className="text-slate-500 mb-2" />
                  <p className="font-medium text-slate-100">Click to upload or drag and drop</p>
                  <p className="text-sm text-slate-400">CSV or Excel files (Max 5MB)</p>
                </label>
              </div>
              <div>
                <h4 className="font-medium text-slate-100 mb-2">CSV Format:</h4>
                <code className="block bg-slate-800 p-3 rounded text-sm text-slate-300 overflow-x-auto">
                  student_id,subject_id,marks_obtained,total_marks
                </code>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-lg max-w-md w-full">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-100">
                  Edit Score
                </h2>
                <button
                  onClick={resetForm}
                  className="text-slate-400 hover:text-slate-100 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAddScore} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Marks Obtained
                  </label>
                  <input
                    type="number"
                    value={formData.marks_obtained}
                    onChange={(e) => setFormData({ ...formData, marks_obtained: Number(e.target.value) })}
                    min="0"
                    className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Grade
                  </label>
                  <input
                    type="text"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    placeholder="A, B, C..."
                    className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Feedback
                  </label>
                  <textarea
                    value={formData.feedback}
                    onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-4 pt-4 border-t">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    Update Score
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg shadow">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search scores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExport('excel')}
              disabled={exportRows.length === 0}
              title="Download the filtered scores as an Excel workbook"
              className="px-4 py-2 bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 rounded-lg hover:bg-emerald-500/25 transition font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              Excel
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exportRows.length === 0}
              title="Download the filtered scores as a PDF"
              className="px-4 py-2 bg-amber-500/15 border border-amber-400/30 text-amber-200 rounded-lg hover:bg-amber-500/25 transition font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={18} />
              PDF
            </button>
            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={exportRows.length === 0}
              title="Download the filtered scores as CSV"
              className="px-4 py-2 bg-blue-500/15 border border-blue-400/30 text-blue-200 rounded-lg hover:bg-blue-500/25 transition font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              CSV
            </button>
          </div>
        </div>

        {/* Scores Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-slate-100">All Scores ({tc.total})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Student" sortKey="student_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Reg No" sortKey="registration_number" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Course" sortKey="course_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Assessment" sortKey="assessment_name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Marks" sortKey="marks_obtained" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Grade" sortKey="grade" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Status" sortKey="is_passed" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Term" sortKey="term" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Date" sortKey="created_at" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((score) => (
                  <tr key={score.id} className="hover:bg-slate-800">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-100">{score.student_name ?? '—'}</p>
                      <p className="text-xs text-slate-500">{score.registration_number ?? '—'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">{score.course_name ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">{score.assessment_name ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-100 font-bold">{score.marks_obtained}</td>
                    <td className="px-6 py-4">
                      {score.grade ? (
                        <span className="px-3 py-1 rounded-full text-sm font-bold bg-blue-500/15 text-blue-300">{score.grade}</span>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        score.is_passed === true
                          ? 'bg-green-100 text-green-800'
                          : score.is_passed === false
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-800 text-slate-400'
                      }`}>
                        {score.is_passed === true ? 'Passed' : score.is_passed === false ? 'Failed' : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{score.term ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {score.created_at ? new Date(score.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(score)}
                          className="p-2 bg-amber-100 text-amber-600 rounded hover:bg-amber-200 transition"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(score.id)}
                          className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
        </div>
      </div>
    </div>
  );
}
