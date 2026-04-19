import { useState, useEffect } from 'react';
import { FileText, Plus, Edit2, Trash2, Upload, CheckCircle2, AlertCircle, Download, Filter } from 'lucide-react';
import { adminScoresAPI } from '../api/admin';

interface Score {
  id: string;
  student_id: string;
  student_name: string;
  subject_id: string;
  subject_name: string;
  marks_obtained: number;
  total_marks: number;
  percentage: number;
  is_passed: boolean;
  recorded_at: string;
  recorded_by: string;
}

interface ScoreForm {
  student_id: string;
  subject_id: string;
  marks_obtained: number;
  total_marks: number;
}

const mockScores: Score[] = [
  {
    id: '1',
    student_id: 'STU001',
    student_name: 'Alice Johnson',
    subject_id: 'MATH101',
    subject_name: 'Mathematics',
    marks_obtained: 85,
    total_marks: 100,
    percentage: 85,
    is_passed: true,
    recorded_at: '2026-04-15T10:00:00Z',
    recorded_by: 'Trainer1',
  },
  {
    id: '2',
    student_id: 'STU002',
    student_name: 'Bob Smith',
    subject_id: 'PHYS101',
    subject_name: 'Physics',
    marks_obtained: 72,
    total_marks: 100,
    percentage: 72,
    is_passed: true,
    recorded_at: '2026-04-14T14:30:00Z',
    recorded_by: 'Trainer2',
  },
];

export default function AdminScoreManagementPage() {
  const [scores, setScores] = useState<Score[]>(mockScores);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [searchStudent, setSearchStudent] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const [formData, setFormData] = useState<ScoreForm>({
    student_id: '',
    subject_id: '',
    marks_obtained: 0,
    total_marks: 100,
  });

  const handleAddScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.student_id || !formData.subject_id || formData.marks_obtained < 0) {
      setError('Please fill all required fields');
      return;
    }

    try {
      const percentage = (formData.marks_obtained / formData.total_marks) * 100;
      const newScore: Score = {
        id: String(Date.now()),
        student_id: formData.student_id,
        student_name: 'New Student',
        subject_id: formData.subject_id,
        subject_name: 'Subject',
        marks_obtained: formData.marks_obtained,
        total_marks: formData.total_marks,
        percentage: percentage,
        is_passed: percentage >= 40,
        recorded_at: new Date().toISOString(),
        recorded_by: 'Admin',
      };

      if (editingId) {
        setScores(scores.map(s => s.id === editingId ? newScore : s));
        setSuccess('Score updated successfully!');
      } else {
        setScores([...scores, newScore]);
        setSuccess('Score added successfully!');
      }

      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add score');
    }
  };

  const resetForm = () => {
    setFormData({ student_id: '', subject_id: '', marks_obtained: 0, total_marks: 100 });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (score: Score) => {
    setFormData({
      student_id: score.student_id,
      subject_id: score.subject_id,
      marks_obtained: score.marks_obtained,
      total_marks: score.total_marks,
    });
    setEditingId(score.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this score?')) {
      setScores(scores.filter(s => s.id !== id));
      setSuccess('Score deleted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock CSV parsing
    setSuccess('File uploaded successfully! 125 scores processed.');
    setShowUpload(false);
    setTimeout(() => setSuccess(null), 3000);
  };

  const filteredScores = scores.filter(score => {
    const matchesSubject = filterSubject === 'all' || score.subject_id === filterSubject;
    const matchesStudent = score.student_name.toLowerCase().includes(searchStudent.toLowerCase());
    return matchesSubject && matchesStudent;
  });

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
                resetForm();
                setShowForm(true);
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2"
            >
              <Plus size={20} />
              Add Score
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
                  {editingId ? 'Edit Score' : 'Add New Score'}
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
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={formData.student_id}
                    onChange={(e) =>
                      setFormData({ ...formData, student_id: e.target.value })
                    }
                    placeholder="STU001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject ID
                  </label>
                  <input
                    type="text"
                    value={formData.subject_id}
                    onChange={(e) =>
                      setFormData({ ...formData, subject_id: e.target.value })
                    }
                    placeholder="MATH101"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Marks Obtained
                    </label>
                    <input
                      type="number"
                      value={formData.marks_obtained}
                      onChange={(e) =>
                        setFormData({ ...formData, marks_obtained: Number(e.target.value) })
                      }
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Total Marks
                    </label>
                    <input
                      type="number"
                      value={formData.total_marks}
                      onChange={(e) =>
                        setFormData({ ...formData, total_marks: Number(e.target.value) })
                      }
                      min="1"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Percentage: <span className="font-bold">
                      {((formData.marks_obtained / formData.total_marks) * 100).toFixed(1)}%
                    </span>
                  </p>
                </div>

                <div className="flex gap-4 pt-4 border-t">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    {editingId ? 'Update' : 'Add'} Score
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
              placeholder="Search by student name..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Subjects</option>
            <option value="MATH101">Mathematics</option>
            <option value="PHYS101">Physics</option>
            <option value="CHEM101">Chemistry</option>
          </select>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Marks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Percentage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Recorded</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredScores.map((score) => (
                  <tr key={score.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{score.student_name}</td>
                    <td className="px-6 py-4 text-gray-600">{score.subject_name}</td>
                    <td className="px-6 py-4 text-gray-900">
                      {score.marks_obtained}/{score.total_marks}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        score.percentage >= 75
                          ? 'bg-green-100 text-green-800'
                          : score.percentage >= 60
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {score.percentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        score.is_passed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {score.is_passed ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(score.recorded_at).toLocaleDateString()}
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
