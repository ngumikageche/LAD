import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Math', score: 85 },
  { name: 'Science', score: 78 },
  { name: 'History', score: 92 },
  { name: 'English', score: 88 },
  { name: 'Art', score: 75 },
];

const SubjectBarChart = () => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="score" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default SubjectBarChart;
