import { useState, useEffect } from 'react';
import { Upload, Plus, Trash2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { trainerScoresAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface ScoreEntry {
  id?: string;
  student_id: string;
  assessment_id: string;
  marks_obtained: number;
  is_passed?: boolean;
}

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
}

export default function ScoreUploadPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload mode: 'individual' or 'bulk'
  const [uploadMode, setUploadMode] = useState<'individual' | 'bulk'>('individual');

  // Individual upload state
  const [selectedSubject, setSelectedSubject] = useState('');
  const [scores, setScores] = useState<ScoreEntry[]>([
    { student_id: '', assessment_id: '', marks_obtained: 0 },
  ]);

  // Bulk upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setLoading(true);
        const data = await trainerSubjectsAPI.getAssignedSubjects();
        setSubjects(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedSubject(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subjects');
      } finally {
        setLoading(false);
      }
    };

    loadSubjects();
  }, []);

  // Individual upload handlers
  const addScoreRow = () => {
    setScores([
      ...scores,
      { student_id: '', assessment_id: '', marks_obtained: 0 },
    ]);
  };

  const removeScoreRow = (idx: number) => {
    setScores(scores.filter((_, i) => i !== idx));
  };

  const updateScore = (
    idx: number,
    field: keyof ScoreEntry,
    value: any
  ) => {
    const updated = [...scores];
    updated[idx] = { ...updated[idx], [field]: value };
    setScores(updated);
  };

  const handleIndividualUpload = async () => {
    if (!selectedSubject || scores.some((s) => !s.student_id || !s.assessment_id)) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Validate scores
      const validation = await trainerScoresAPI.validateScores(scores);
      if (!validation.valid) {
        setError(`Validation failed: ${validation.errors.join(', ')}`);
        return;
      }

      // Upload scores
      await trainerScoresAPI.uploadScores(scores);
      setSuccess(`Successfully uploaded ${scores.length} score(s)`);
      setScores([{ student_id: '', assessment_id: '', marks_obtained: 0 }]);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload scores');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!csvFile) {
      setError('Please select a CSV file');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const result = await trainerScoresAPI.uploadCSV(csvFile);
      setSuccess(
        `Successfully uploaded ${result.uploaded_count} score(s). ${result.errors?.length || 0} error(s).`
      );
      setCsvFile(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CSV');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Upload size={32} className="text-green-500" />
            Upload Scores
          </h1>
          <p className="text-slate-400 mt-2">
            Add student scores for assessments in your subjects
          </p>
        </div>

        {/* Alert Messages */}
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

        {/* Mode Selection */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-bold text-slate-100 mb-4">Upload Method</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setUploadMode('individual')}
              className={`p-4 rounded-lg border-2 transition ${
                uploadMode === 'individual'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <Plus size={24} className="mx-auto mb-2 text-blue-500" />
              <p className="font-semibold text-slate-100">Individual Entry</p>
              <p className="text-xs text-slate-400">Add scores one by one</p>
            </button>

            <button
              onClick={() => setUploadMode('bulk')}
              className={`p-4 rounded-lg border-2 transition ${
                uploadMode === 'bulk'
                  ? 'border-green-500 bg-green-50'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <FileText size={24} className="mx-auto mb-2 text-green-500" />
              <p className="font-semibold text-slate-100">CSV Upload</p>
              <p className="text-xs text-slate-400">Bulk import from file</p>
            </button>
          </div>
        </div>

        {/* Individual Upload Mode */}
        {uploadMode === 'individual' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-6">Add Scores</h2>

            {/* Subject Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Select Subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_name} ({subject.subject_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Scores Table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full">
                <thead className="bg-slate-800 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300">
                      Student ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300">
                      Assessment ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300">
                      Marks (%)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scores.map((score, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          placeholder="STU001"
                          value={score.student_id}
                          onChange={(e) =>
                            updateScore(idx, 'student_id', e.target.value)
                          }
                          className="w-full px-3 py-1 border border-slate-700 rounded text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          placeholder="ASS001"
                          value={score.assessment_id}
                          onChange={(e) =>
                            updateScore(idx, 'assessment_id', e.target.value)
                          }
                          className="w-full px-3 py-1 border border-slate-700 rounded text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={score.marks_obtained}
                          onChange={(e) =>
                            updateScore(
                              idx,
                              'marks_obtained',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full px-3 py-1 border border-slate-700 rounded text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {scores.length > 1 && (
                          <button
                            onClick={() => removeScoreRow(idx)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Row Button */}
            <button
              onClick={addScoreRow}
              className="mb-6 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition flex items-center gap-2"
            >
              <Plus size={18} />
              Add Another Row
            </button>

            {/* Submit Button */}
            <button
              onClick={handleIndividualUpload}
              disabled={isSubmitting}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              <Upload size={20} />
              {isSubmitting ? 'Uploading...' : 'Upload Scores'}
            </button>
          </div>
        )}

        {/* Bulk Upload Mode */}
        {uploadMode === 'bulk' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-6">Bulk Upload from CSV</h2>

            {/* CSV Format Help */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="font-semibold text-blue-900 mb-2">CSV Format</p>
              <p className="text-sm text-blue-800 mb-2">
                Your CSV file should have the following columns:
              </p>
              <code className="text-xs bg-slate-900 border border-slate-800 p-2 rounded block text-slate-100 mb-2">
                student_id, assessment_id, marks_obtained, subject_id
              </code>
              <p className="text-xs text-blue-700">
                Example: STU001, ASS001, 85.5, SUBJ001
              </p>
            </div>

            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {csvFile && (
                <p className="mt-2 text-sm text-slate-400">
                  Selected: <span className="font-medium">{csvFile.name}</span>
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleBulkUpload}
              disabled={isSubmitting || !csvFile}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              <Upload size={20} />
              {isSubmitting ? 'Uploading...' : 'Upload CSV'}
            </button>

            {/* Download Template */}
            <div className="mt-6 p-4 bg-slate-800 rounded-lg text-center">
              <p className="text-sm text-slate-400 mb-2">Need a template?</p>
              <button className="px-4 py-2 bg-slate-600 text-slate-200 rounded-lg hover:bg-slate-600 transition font-medium">
                📥 Download Template
              </button>
            </div>
          </div>
        )}

        {/* Tips Section */}
        <div className="mt-8 bg-green-50 rounded-lg p-6 border border-green-200">
          <h3 className="font-semibold text-green-900 mb-3">💡 Tips</h3>
          <ul className="text-green-800 text-sm space-y-2">
            <li>• Marks should be between 0-100</li>
            <li>• Duplicate scores are automatically prevented</li>
            <li>• You can only upload scores for your assigned subjects</li>
            <li>• Scores are final and locked after 30 days</li>
            <li>• Use the CSV method for bulk uploads to save time</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
