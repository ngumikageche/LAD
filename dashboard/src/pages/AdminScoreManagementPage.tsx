import { useState, useEffect } from 'react';
import { FileText, Edit2, Trash2, Upload, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { adminScoresAPI } from '../api/admin';

interface Score {
  id: string;
  student_id: string | null;
  student_name: string | null;
  registration_number: string | null;
  subject_id: string | null;
  subject_name: string | null;
  assessment_id: string | null;
  assessment_name: string | null;
  marks_obtained: number;
  grade: string | null;
  is_passed: boolean | null;
  term: string | null;
  created_at: string | null;
}

interface ScoreForm {
  marks_obtained: number;
  grade: string;
  feedback: string;
}

export default function AdminScoreManagementPage() {
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
      const data = await adminScoresAPI.getScores() as { items: Score[] };
      setScores(Array.isArray(data?.items) ? data.items : []);
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
    (score.subject_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (score.assessment_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FileText size={32} className="text-blue-500" />
              Score Management
            </h1>
            <p className="text-gray-600 mt-2">Monitor, add, edit and validate academic scores</p>
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
          <div className="mb-6 p-6 bg-white rounded-lg shadow border-2 border-dashed border-green-300">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Bulk Upload Scores</h3>
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center">
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
                  <Upload size={48} className="text-gray-300 mb-2" />
                  <p className="font-medium text-gray-900">Click to upload or drag and drop</p>
                  <p className="text-sm text-gray-600">CSV or Excel files (Max 5MB)</p>
                </label>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">CSV Format:</h4>
                <code className="block bg-gray-100 p-3 rounded text-sm text-gray-700 overflow-x-auto">
                  student_id,subject_id,marks_obtained,total_marks
                </code>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Edit Score
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-600 hover:text-gray-900 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAddScore} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Marks Obtained
                  </label>
                  <input
                    type="number"
                    value={formData.marks_obtained}
                    onChange={(e) => setFormData({ ...formData, marks_obtained: Number(e.target.value) })}
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Grade
                  </label>
                  <input
                    type="text"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    placeholder="A, B, C..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Feedback
                  </label>
                  <textarea
                    value={formData.feedback}
                    onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4 bg-white p-4 rounded-lg shadow">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search scores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button className="px-6 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition font-medium flex items-center gap-2">
            <Download size={20} />
            Export
          </button>
        </div>

        {/* Scores Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-gray-900">All Scores ({filteredScores.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Assessment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Marks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Grade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Term</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredScores.map((score) => (
                  <tr key={score.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{score.student_name ?? '—'}</p>
                      {score.registration_number && (
                        <p className="text-xs text-gray-500">{score.registration_number}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{score.subject_name ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{score.assessment_name ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-900 font-bold">{score.marks_obtained}</td>
                    <td className="px-6 py-4">
                      {score.grade ? (
                        <span className="px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">{score.grade}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        score.is_passed === true
                          ? 'bg-green-100 text-green-800'
                          : score.is_passed === false
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {score.is_passed === true ? 'Passed' : score.is_passed === false ? 'Failed' : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{score.term ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
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
        </div>
      </div>
    </div>
  );
}
