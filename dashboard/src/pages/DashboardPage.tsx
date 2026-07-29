import StatCard from '../components/ui/StatCard';
import { Users, Book, TrendingUp, AlertTriangle } from 'lucide-react';
import PerformanceLineChart from '../components/charts/PerformanceLineChart';
import SubjectBarChart from '../components/charts/SubjectBarChart';
import PerformancePieChart from '../components/charts/PerformancePieChart';
import StudentPerformanceCard from '../components/ui/StudentPerformanceCard';
import ClassSummaryPanel from '../components/ui/ClassSummaryPanel';
import { useAuth } from '../auth/AuthContext';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

const DashboardPage = () => {
  const { user, token } = useAuth();
  const [stats, setStats] = useState({ subjectsCount: 0, avgScore: 0, topSubject: '-', atRisk: 0, totalStudents: 0 });

  useEffect(() => {
    const loadStudentStats = async () => {
      if (!user || !token) return;
      const role = (user.role_name || '').toLowerCase();
      const isStudent = role === 'student' || (user.permissions && user.permissions['students_view_own_subjects']);
      const isTrainer = role === 'trainer' || (user.permissions && user.permissions['trainer_subjects.read']);

      if (isStudent) {
        try {
          const subjectsResp = await apiRequest<any>('/students/me/subjects', { token });
          const subjects = subjectsResp.subjects || [];
        let totalMarks: number[] = [];
        const subjectAvgs: { name: string; avg: number }[] = [];
        for (const s of subjects) {
          const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
          const marks = (m.marks || []).map((mk: any) => Number(mk.value)).filter((v: number) => !isNaN(v));
          if (marks.length) {
            const avg = marks.reduce((a: number, b: number) => a + b, 0) / marks.length;
            subjectAvgs.push({ name: s.name, avg });
            totalMarks = totalMarks.concat(marks);
          }
        }
        const overallAvg = totalMarks.length ? Math.round((totalMarks.reduce((a, b) => a + b, 0) / totalMarks.length) * 10) / 10 : 0;
        const atRisk = totalMarks.filter(v => v < 50).length;
        const top = subjectAvgs.sort((a, b) => b.avg - a.avg)[0];
        setStats({ subjectsCount: subjects.length, avgScore: overallAvg, topSubject: top ? top.name : '-', atRisk, totalStudents: 0 });
        } catch (e) {
          // ignore
        }
        return;
      }

      if (isTrainer) {
        try {
          const t = await apiRequest<any>('/trainer-subjects/me', { token });
          const subs = t.subjects || [];
          let totalMarks: number[] = [];
          const moduleSet = new Set<string>();
          for (const s of subs) {
            if (s.module && s.module.id) moduleSet.add(s.module.id);
            const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
            const marks = (m.marks || []).map((mk: any) => Number(mk.value)).filter((v: number) => !isNaN(v));
            totalMarks = totalMarks.concat(marks);
          }
          const overallAvg = totalMarks.length ? Math.round((totalMarks.reduce((a, b) => a + b, 0) / totalMarks.length) * 10) / 10 : 0;
          setStats({ subjectsCount: subs.length, avgScore: overallAvg, topSubject: subs.length ? subs[0].name : '-', atRisk: t.total_students || 0, totalStudents: t.total_students || 0 });
        } catch (e) {
          // ignore
        }
        return;
      }

      // Admin or other roles: fetch global stats
      try {
        const students = await apiRequest<any[]>('/students', { token });
        const totalStudents = students.length;
        // get all subjects
        const allSubjects = await apiRequest<any[]>('/subjects', { token });
        let totalMarks: number[] = [];
        for (const s of allSubjects) {
          const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
          const marks = (m.marks || []).map((mk: any) => Number(mk.value)).filter((v: number) => !isNaN(v));
          totalMarks = totalMarks.concat(marks);
        }
        const overallAvg = totalMarks.length ? Math.round((totalMarks.reduce((a, b) => a + b, 0) / totalMarks.length) * 10) / 10 : 0;
        const atRisk = totalMarks.filter(v => v < 50).length;
        setStats({ subjectsCount: allSubjects.length, avgScore: overallAvg, topSubject: allSubjects.length ? allSubjects[0].name : '-', atRisk, totalStudents });
      } catch (e) {
        // ignore
      }
    };
    loadStudentStats();
  }, [user, token]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-100 mb-2">Dashboard</h1>
        <p className="text-slate-400">Learning Analytics Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(() => {
          const role = user && (user.role_name || '').toLowerCase();
          const firstTitle = role === 'student' ? 'Subjects Enrolled' : role === 'trainer' ? 'Assigned Subjects' : 'Total Students';
          const firstValue = role === 'student' ? String(stats.subjectsCount) : role === 'trainer' ? String(stats.subjectsCount) : String(stats.totalStudents);
          return (
            <>
              <StatCard title={firstTitle} value={firstValue} icon={<Users className="h-6 w-6 text-indigo-600" />} colorScheme="indigo" />
              <StatCard title="Average Score" value={`${stats.avgScore}%`} icon={<TrendingUp className="h-6 w-6 text-emerald-600" />} colorScheme="emerald" />
              <StatCard title="Top Subject" value={stats.topSubject} icon={<Book className="h-6 w-6 text-amber-600" />} colorScheme="amber" />
              <StatCard title={role === 'student' ? 'Your At Risk' : 'Students At Risk'} value={String(stats.atRisk)} icon={<AlertTriangle className="h-6 w-6 text-red-600" />} colorScheme="red" />
            </>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-lg border border-slate-800">
          <h3 className="text-xl font-bold text-slate-100 mb-6">Performance Over Time</h3>
          <PerformanceLineChart />
        </div>
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-lg border border-slate-800">
          <h3 className="text-xl font-bold text-slate-100 mb-6">Performance Distribution</h3>
          <PerformancePieChart />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-lg border border-slate-800">
          <h3 className="text-xl font-bold text-slate-100 mb-6">Subject Comparison</h3>
          <SubjectBarChart />
        </div>
        <div className="space-y-6">
          <StudentPerformanceCard />
          <ClassSummaryPanel />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
