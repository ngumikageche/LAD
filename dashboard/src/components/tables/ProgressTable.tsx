import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import type { Assessment } from '../../types/backend';

// Placeholder for real data
const scoresData: Assessment[] = [];
const AddScoreModal = ({ isOpen, onClose, onScoreAdded }) => {
  const { user, token } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({ student_id: '', subject_id: '', score: '', term: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Fetch subjects assigned to this trainer
    apiRequest<string[]>(`/trainer-subjects/${user.id}`, { token })
      .then(ids => Promise.all(ids.data.map(id => apiRequest<Subject>(`/subjects/${id}`, { token }))))
      .then(subjects => setSubjects(subjects))
      .catch(() => setSubjects([]));
  }, [isOpen, user, token]);

  useEffect(() => {
    if (!form.subject_id) return setStudents([]);
    // Fetch students enrolled in this subject
    apiRequest<Student[]>(`/student-subjects?subject_id=${form.subject_id}`, { token })
      .then(res => setStudents(res.data))
      .catch(() => setStudents([]));
  }, [form.subject_id, token]);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    await apiRequest('/scores', {
      method: 'POST',
      token,
      body: { ...form, trainer_id: user.id }
    });
    setLoading(false);
    onScoreAdded();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Add New Score</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
                <X className="text-gray-600" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">Subject</label>
                <select name="subject_id" value={form.subject_id} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm">
                  <option value="">Select subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Student</label>
                <select name="student_id" value={form.student_id} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm">
                  <option value="">Select student</option>
                  {students.map(st => <option key={st.id} value={st.id}>{st.registration_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Score</label>
                <input name="score" type="number" value={form.score} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Term</label>
                <input name="term" value={form.term} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" />
              </div>
              <div className="flex justify-end pt-4">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 mr-2">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700" disabled={loading}>{loading ? 'Saving...' : 'Add Score'}</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
// (Removed duplicate/old modal and table code)

// Main ProgressTable component (placeholder)
const ProgressTable = () => {
  return <div>Progress Table Placeholder</div>;
};

export { AddScoreModal };
export default ProgressTable;
