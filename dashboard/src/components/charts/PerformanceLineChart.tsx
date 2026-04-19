import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

type Point = { name: string; score: number };

const PerformanceLineChart = () => {
  const { token, user } = useAuth();
  const [data, setData] = useState<Point[]>([]);

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
        const allMarks: Array<{ value: number; recorded_at?: string }> = [];
        for (const s of subjects) {
          const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
          (m.marks || []).forEach((mk: any) => {
            if (mk && mk.value != null && mk.recorded_at) allMarks.push({ value: Number(mk.value), recorded_at: mk.recorded_at });
          });
        }

        // group by month YYYY-MM
        const buckets: Record<string, number[]> = {};
        allMarks.forEach((mk) => {
          const month = mk.recorded_at ? mk.recorded_at.slice(0, 7) : 'unknown';
          buckets[month] = buckets[month] || [];
          buckets[month].push(mk.value);
        });

        const points: Point[] = Object.keys(buckets).sort().map((k) => {
          const vals = buckets[k];
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          return { name: k, score: Math.round(avg * 10) / 10 };
        });
        setData(points);
      } catch (e) {
        setData([]);
      }
    };
    load();
  }, [token]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PerformanceLineChart;
