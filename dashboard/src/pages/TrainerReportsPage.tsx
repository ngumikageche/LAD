import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import { trainerReportsAPI, trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
}

interface Report {
  id: string;
  subject_name: string;
  total_students: number;
  avg_score: number;
  pass_rate: number;
  generated_date: string;
}

export default function TrainerReportsPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [subjectsData, reportsData] = await Promise.all([
          trainerSubjectsAPI.getAssignedSubjects(),
          trainerReportsAPI.getHistoricalReports(),
        ]);

        setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
        setReports(Array.isArray(reportsData) ? reportsData : []);

        if (Array.isArray(subjectsData) && subjectsData.length > 0) {
          setSelectedSubject(subjectsData[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleGenerateReport = async () => {
    if (!selectedSubject) {
      setError('Please select a subject');
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      const report = await trainerReportsAPI.generateSubjectReport(selectedSubject);
      setReports([report, ...reports]);
      setSuccess('Report generated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (subjectId: string, format: 'csv' | 'pdf') => {
    try {
      const blob = await trainerReportsAPI.exportResults(subjectId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to export ${format.toUpperCase()}`);
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={32} className="text-indigo-500" />
            Reports & Analysis
          </h1>
          <p className="text-gray-600 mt-2">
            Generate and export comprehensive reports on class performance
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
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Report Generator */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Generate New Report</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Subject Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">-- Select Subject --</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_name} ({subject.subject_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Generate Button */}
            <div className="flex items-end">
              <button
                onClick={handleGenerateReport}
                disabled={generating || !selectedSubject}
                className="w-full px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw size={18} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {/* Quick Info */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
            💡 Reports include: student averages, pass rates, score distributions, and comparative analytics
          </div>
        </div>

        {/* Historical Reports */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar size={24} className="text-indigo-500" />
              Recent Reports
            </h2>
          </div>

          {reports.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <p>No reports generated yet</p>
              <p className="text-sm">Generate your first report to see it here</p>
            </div>
          ) : (
            <div className="divide-y">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-6 hover:bg-gray-50 transition flex items-center justify-between"
                >
                  {/* Report Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <BarChart3 size={24} className="text-indigo-500" />
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {report.subject_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Generated {new Date(report.generated_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <p className="text-sm text-gray-600">Students</p>
                        <p className="text-lg font-bold text-gray-900">
                          {report.total_students}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Average Score</p>
                        <p className="text-lg font-bold text-indigo-600">
                          {report.avg_score.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pass Rate</p>
                        <p className="text-lg font-bold text-green-600">
                          {report.pass_rate.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Export Buttons */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleExport(report.id, 'csv')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2"
                    >
                      <Download size={16} />
                      CSV
                    </button>
                    <button
                      onClick={() => handleExport(report.id, 'pdf')}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium flex items-center gap-2"
                    >
                      <Download size={16} />
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Report Templates */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">📊 Class Summary</h3>
            <p className="text-gray-600 text-sm mb-4">
              Overall class performance metrics including averages, pass rates, and distributions
            </p>
            <button className="w-full px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition font-medium">
              Generate
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">📈 Performance Trends</h3>
            <p className="text-gray-600 text-sm mb-4">
              Track performance changes over time and identify improvement opportunities
            </p>
            <button className="w-full px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition font-medium">
              Generate
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">⚠️ At-Risk Analysis</h3>
            <p className="text-gray-600 text-sm mb-4">
              Detailed analysis of students needing intervention and support
            </p>
            <button className="w-full px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition font-medium">
              Generate
            </button>
          </div>
        </div>

        {/* Report Features */}
        <div className="mt-8 bg-indigo-50 rounded-lg p-6 border border-indigo-200">
          <h3 className="font-semibold text-indigo-900 mb-4">✨ Report Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex gap-3">
              <span className="text-indigo-600 font-bold">✓</span>
              <p className="text-indigo-800 text-sm">Class averages and statistics</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-600 font-bold">✓</span>
              <p className="text-indigo-800 text-sm">Individual student performance cards</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-600 font-bold">✓</span>
              <p className="text-indigo-800 text-sm">Grade distributions and analysis</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-600 font-bold">✓</span>
              <p className="text-indigo-800 text-sm">At-risk student identification</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-600 font-bold">✓</span>
              <p className="text-indigo-800 text-sm">Performance trend analysis</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-600 font-bold">✓</span>
              <p className="text-indigo-800 text-sm">Exportable to CSV and PDF</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
