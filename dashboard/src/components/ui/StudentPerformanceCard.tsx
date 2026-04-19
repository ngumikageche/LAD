import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

type SubjectAvg = { name: string; avg: number };

const StudentPerformanceCard = () => {
  const { token, user } = useAuth();
  const [name, setName] = useState('Student');
  const [classLabel, setClassLabel] = useState('Class');
  const [subjects, setSubjects] = useState<SubjectAvg[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const role = (user?.role_name || '').toLowerCase();
        const isStudent = role === 'student' || (user?.permissions && user.permissions['students_view_own_subjects']);
        if (!isStudent) return;

        const me = await apiRequest<any>('/students/me', { token });
        setName(me.user?.name || 'Student');
        // fetch enrolled subjects and compute averages
        const subjectsResp = await apiRequest<any>('/students/me/subjects', { token });
        const subs = subjectsResp.subjects || [];
        if (subs.length > 0) {
          const label = subs[0].module?.name || subs[0].name || 'Class';
          setClassLabel(label);
        }
        const rows: SubjectAvg[] = [];
        for (const s of subs) {
          const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
          const marks = (m.marks || []).map((mk: any) => Number(mk.value)).filter((v: number) => !isNaN(v));
          const avg = marks.length ? Math.round((marks.reduce((a: number, b: number) => a + b, 0) / marks.length) * 10) / 10 : 0;
          rows.push({ name: s.name, avg });
        }
        // sort desc and take top 3
        rows.sort((a, b) => b.avg - a.avg);
        setSubjects(rows.slice(0, 3));
      } catch (e) {
        // ignore
      }
    };
    load();
  }, [token]);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
        <span className="w-1 h-6 bg-gradient-to-b from-indigo-600 to-blue-600 rounded-full mr-3"></span>
        Top Performer
      </h3>
      <div className="flex items-center space-x-4 mb-6 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl">
        <img
          className="w-14 h-14 rounded-full border-2 border-indigo-300 shadow-md"
          src={`https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`}
          alt="Student"
        />
        <div>
          <p className="font-bold text-gray-900">{name}</p>
          <p className="text-sm text-gray-500">{classLabel}</p>
        </div>
      </div>
      <div className="space-y-4">
        {subjects.length === 0 ? (
          <div className="text-gray-500">No subject scores available</div>
        ) : (
          subjects.map((s) => (
            <div key={s.name}>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1.5">
                <span>{s.name}</span>
                <span className="text-indigo-600 bg-indigo-100 px-2 py-1 rounded">{s.avg}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2.5 rounded-full" style={{ width: `${Math.min(100, s.avg)}%` }}></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentPerformanceCard;
