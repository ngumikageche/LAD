import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Trainer, Subject, Institution } from '../types/backend';

// UI for admin to assign trainers to multiple subjects under the same institution
const TrainerSubjectsPage = () => {
  const { token } = useAuth();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const [trainersData, subjectsData, institutionsData] = await Promise.all([
        apiRequest<Trainer[]>('/trainers', { token }),
        apiRequest<Subject[]>('/subjects', { token }),
        apiRequest<Institution[]>('/institutions', { token }),
      ]);
      setTrainers(trainersData);
      setSubjects(subjectsData);
      setInstitutions(institutionsData);
    };
    if (token) fetchData();
  }, [token]);

  const handleAssign = async () => {
    if (!selectedTrainerId || selectedSubjectIds.length === 0) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      await apiRequest(`/trainer-subjects/assign-multiple`, {
        method: 'POST',
        token,
        body: {
          trainer_id: selectedTrainerId,
          subject_ids: selectedSubjectIds,
        },
      });
      setMessage('Subjects assigned successfully!');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to assign subjects');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter trainers and subjects by selected institution
  const filteredTrainers = trainers.filter(t => {
    // You may want to filter by department/institution here if available
    return true;
  });
  const filteredSubjects = subjects.filter(s => {
    // You may want to filter by module/course/institution here if available
    return true;
  });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Assign Subjects to Trainer</h2>
      <div className="mb-4">
        <label className="block mb-1 font-medium">Institution</label>
        <select
          className="w-full border rounded p-2"
          value={selectedInstitutionId}
          onChange={e => setSelectedInstitutionId(e.target.value)}
        >
          <option value="">Select Institution</option>
          {institutions.map(inst => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium">Trainer</label>
        <select
          className="w-full border rounded p-2"
          value={selectedTrainerId}
          onChange={e => setSelectedTrainerId(e.target.value)}
        >
          <option value="">Select Trainer</option>
          {filteredTrainers.map(tr => (
            <option key={tr.id} value={tr.id}>{tr.user?.name || tr.user_id}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium">Subjects</label>
        <select
          className="w-full border rounded p-2"
          multiple
          value={selectedSubjectIds}
          onChange={e => {
            const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
            setSelectedSubjectIds(options);
          }}
        >
          {filteredSubjects.map(sub => (
            <option key={sub.id} value={sub.id}>{sub.name}</option>
          ))}
        </select>
      </div>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        onClick={handleAssign}
        disabled={isSubmitting || !selectedTrainerId || selectedSubjectIds.length === 0}
      >
        {isSubmitting ? 'Assigning...' : 'Assign Subjects'}
      </button>
      {message && <div className="mt-4 text-green-400">{message}</div>}
    </div>
  );
};

export default TrainerSubjectsPage;
