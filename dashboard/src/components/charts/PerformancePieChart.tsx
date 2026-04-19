import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const PerformancePieChart = () => {
  const { token, user } = useAuth();
  const [data, setData] = useState<any[]>([]);

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
        const counts = { good: 0, average: 0, risk: 0 };
        for (const s of subjects) {
          const m = await apiRequest<any>(`/subjects/${s.id}/marks`, { token });
          (m.marks || []).forEach((mk: any) => {
            const v = Number(mk.value);
            if (isNaN(v)) return;
            if (v >= 75) counts.good += 1;
            else if (v >= 50) counts.average += 1;
            else counts.risk += 1;
          });
        }
        setData([
          { name: 'Good', value: counts.good },
          { name: 'Average', value: counts.average },
          { name: 'At Risk', value: counts.risk },
        ]);
      } catch (e) {
        setData([]);
      }
    };
    load();
  }, [token]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value">
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default PerformancePieChart;
