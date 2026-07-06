import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

type SubjectScore = { name: string; score: number };

const SubjectBarChart = () => {
  const { token, user } = useAuth();
  const [data, setData] = useState<SubjectScore[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const role = (user?.role_name || '').toLowerCase();
        const isStudent = role === 'student' || (user?.permissions && user.permissions['students_view_own_subjects']);
        if (!isStudent) {
          setData([]);
          return;
        }

        const subjectsResp = await apiRequest<any>('/students/me/subjects', { token });
        const subjects = subjectsResp.subjects || [];
        const rows: SubjectScore[] = [];
        for (const s of subjects) {
          const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
          const marks = (m.marks || []).map((mk: any) => Number(mk.value)).filter((v: number) => !isNaN(v));
          const avg = marks.length ? Math.round((marks.reduce((a: number, b: number) => a + b, 0) / marks.length) * 10) / 10 : 0;
          rows.push({ name: s.name, score: avg });
        }
        setData(rows);
      } catch (e) {
        setData([]);
      }
    };
    load();
  }, [token]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name">
          <Label value="Subject" position="insideBottom" offset={-5} />
        </XAxis>
        <YAxis>
          <Label value="Average Score (%)" angle={-90} position="insideLeft" />
        </YAxis>
        <Tooltip />
        <Legend />
        <Bar dataKey="score" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default SubjectBarChart;
