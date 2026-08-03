import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import { trainerReportsAPI, trainerSubjectsAPI, type SubjectReport } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';
import { exportPDF } from '../utils/exportUtils';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
}

interface Report {
  id: string;
  /** Kept separate from `id`: exports need the real subject id, not the row key. */
  subject_id: string;
  subject_name: string;
  total_students: number;
  avg_score: number;
  pass_rate: number;
  fail_rate: number;
  highest_score: number;
  lowest_score: number;
  distribution: SubjectReport['distribution'];
  generated_date: string;
}

const toReport = (report: SubjectReport): Report => ({
  id: `${report.subject_id}-${Date.now()}`,
  subject_id: report.subject_id,
  subject_name: report.subject_name,
  total_students: report.total_students,
  avg_score: report.avg_score,
  pass_rate: report.pass_rate,
  fail_rate: report.fail_rate,
  highest_score: report.highest_score,
  lowest_score: report.lowest_score,
  distribution: report.distribution,
  generated_date: new Date().toISOString(),
});

export default function TrainerReportsPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState<string | null>(null);

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
      const report = toReport(await trainerReportsAPI.generateSubjectReport(selectedSubject));
      // Avoid duplicate reports - filter out any existing report with the same ID
      setReports(prev => [report, ...prev.filter(r => r.id !== report.id)]);
      setSuccess('Report generated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (report: Report, format: 'csv' | 'xlsx') => {
    try {
      setError(null);
      const blob = await trainerReportsAPI.exportResults(report.subject_id, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.subject_name.replace(/\s+/g, '_')}_report.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    }
  };

  /** Built in the browser from the loaded report, so no server round trip. */
  const handleExportPDF = (report: Report) => {
    exportPDF(
      [
        {
          name: 'Summary',
          rows: [{
            subject: report.subject_name,
            total_students: report.total_students,
            average_score: `${report.avg_score.toFixed(1)}%`,
            pass_rate: `${report.pass_rate.toFixed(1)}%`,
            fail_rate: `${report.fail_rate.toFixed(1)}%`,
            highest_score: report.highest_score,
            lowest_score: report.lowest_score,
          }],
        },
        {
          name: 'Grade Distribution',
          rows: Object.entries(report.distribution).map(([band, count]) => ({
            band: band.replace(/_/g, ' '),
            learners: count,
            share: report.total_students
              ? `${((count / report.total_students) * 100).toFixed(1)}%`
              : '—',
          })),
        },
      ],
      `${report.subject_name.replace(/\s+/g, '_')}_report`,
      {
        generatedBy: user?.name ?? 'Unknown',
        reportTitle: `${report.subject_name} — Subject Report`,
        subtitle: `Generated ${new Date(report.generated_date).toLocaleString()}`,
      },
    );
  };

  const handleClassSummary = async () => {
    if (!selectedSubject) {
      setError('Please select a subject');
      return;
    }

    try {
      setGeneratingTemplate('class-summary');
      setError(null);
      const report = toReport(await trainerReportsAPI.generateSubjectReport(selectedSubject, 'class-summary'));
      setReports(prev => [report, ...prev.filter(r => r.id !== report.id)]);
      setSuccess('Class Summary Report generated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Class Summary');
    } finally {
      setGeneratingTemplate(null);
    }
  };

  const handlePerformanceTrends = async () => {
    if (!selectedSubject) {
      setError('Please select a subject');
      return;
    }

    try {
      setGeneratingTemplate('performance-trends');
      setError(null);
      const report = toReport(await trainerReportsAPI.generateSubjectReport(selectedSubject, 'performance-trends'));
      setReports(prev => [report, ...prev.filter(r => r.id !== report.id)]);
      setSuccess('Performance Trends Report generated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Performance Trends');
    } finally {
      setGeneratingTemplate(null);
    }
  };

  const handleAtRiskAnalysis = async () => {
    if (!selectedSubject) {
      setError('Please select a subject');
      return;
    }

    try {
      setGeneratingTemplate('at-risk');
      setError(null);
      const report = toReport(await trainerReportsAPI.generateSubjectReport(selectedSubject, 'at-risk'));
      setReports(prev => [report, ...prev.filter(r => r.id !== report.id)]);
      setSuccess('At-Risk Analysis Report generated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate At-Risk Analysis');
    } finally {
      setGeneratingTemplate(null);
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
    <div className="min-h-screen bg-blue-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <FileText size={32} className="text-indigo-500" />
            Reports & Analysis
          </h1>
          <p className="text-slate-400 mt-2">
            Generate and export comprehensive reports on class performance
          </p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-300">
            {success}
          </div>
        )}

        {/* Report Generator */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-100 mb-6">Generate New Report</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Subject Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
          <div className="mt-4 p-4 bg-blue-500/10 rounded-lg text-sm text-blue-300">
            💡 Reports include: student averages, pass rates, score distributions, and comparative analytics
          </div>
        </div>

        {/* Historical Reports */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Calendar size={24} className="text-indigo-500" />
              Recent Reports
            </h2>
          </div>

          {reports.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText size={48} className="mx-auto text-slate-500 mb-4" />
              <p>No reports generated yet</p>
              <p className="text-sm">Generate your first report to see it here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-6 hover:bg-slate-800 transition flex items-center justify-between"
                >
                  {/* Report Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <BarChart3 size={24} className="text-indigo-500" />
                      <div>
                        <h3 className="text-lg font-semibold text-slate-100">
                          {report.subject_name}
                        </h3>
                        <p className="text-sm text-slate-400">
                          Generated {new Date(report.generated_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <p className="text-sm text-slate-400">Students</p>
                        <p className="text-lg font-bold text-slate-100">
                          {report.total_students}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-400">Average Score</p>
                        <p className="text-lg font-bold text-indigo-400">
                          {report.avg_score.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-400">Pass Rate</p>
                        <p className="text-lg font-bold text-green-400">
                          {report.pass_rate.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Export Buttons */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleExport(report, 'xlsx')}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-medium flex items-center gap-2"
                    >
                      <Download size={16} />
                      Excel
                    </button>
                    <button
                      onClick={() => handleExportPDF(report)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium flex items-center gap-2"
                    >
                      <Download size={16} />
                      PDF
                    </button>
                    <button
                      onClick={() => handleExport(report, 'csv')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2"
                    >
                      <Download size={16} />
                      CSV
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Report Templates */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-3">📊 Class Summary</h3>
            <p className="text-slate-400 text-sm mb-4">
              Overall class performance metrics including averages, pass rates, and distributions
            </p>
            <button 
              onClick={handleClassSummary}
              disabled={!selectedSubject || generatingTemplate === 'class-summary'}
              className="w-full px-4 py-2 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/25 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={generatingTemplate === 'class-summary' ? 'animate-spin' : ''} />
              {generatingTemplate === 'class-summary' ? 'Generating...' : 'Generate'}
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-3">📈 Performance Trends</h3>
            <p className="text-slate-400 text-sm mb-4">
              Track performance changes over time and identify improvement opportunities
            </p>
            <button 
              onClick={handlePerformanceTrends}
              disabled={!selectedSubject || generatingTemplate === 'performance-trends'}
              className="w-full px-4 py-2 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/25 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={generatingTemplate === 'performance-trends' ? 'animate-spin' : ''} />
              {generatingTemplate === 'performance-trends' ? 'Generating...' : 'Generate'}
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-3">⚠️ At-Risk Analysis</h3>
            <p className="text-slate-400 text-sm mb-4">
              Detailed analysis of students needing intervention and support
            </p>
            <button 
              onClick={handleAtRiskAnalysis}
              disabled={!selectedSubject || generatingTemplate === 'at-risk'}
              className="w-full px-4 py-2 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/25 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={generatingTemplate === 'at-risk' ? 'animate-spin' : ''} />
              {generatingTemplate === 'at-risk' ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Report Features */}
        <div className="mt-8 bg-indigo-500/10 rounded-lg p-6 border border-indigo-500/30">
          <h3 className="font-semibold text-indigo-300 mb-4">✨ Report Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold">✓</span>
              <p className="text-indigo-300 text-sm">Class averages and statistics</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold">✓</span>
              <p className="text-indigo-300 text-sm">Individual student performance cards</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold">✓</span>
              <p className="text-indigo-300 text-sm">Grade distributions and analysis</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold">✓</span>
              <p className="text-indigo-300 text-sm">At-risk student identification</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold">✓</span>
              <p className="text-indigo-300 text-sm">Performance trend analysis</p>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold">✓</span>
              <p className="text-indigo-300 text-sm">Exportable to CSV and PDF</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
