import { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Mail, UserRound } from 'lucide-react';
import { studentApi, type StudentSubject } from '../services/studentApi';

const StudentSubjectsPage = () => {
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await studentApi.getSubjects();
        setSubjects(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subjects');
      } finally {
        setLoading(false);
      }
    };

    loadSubjects();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-slate-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-100">My Subjects</h1>
        <p className="mt-2 text-slate-600">View your enrolled subjects, course information, and assigned trainers.</p>
      </div>

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => (
          <article key={subject.id} className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{subject.name}</h2>
                <p className="mt-2 text-sm text-slate-600">{subject.description || 'No description available.'}</p>
              </div>
              <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-300">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-slate-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Module</p>
                <p className="mt-2 font-medium text-slate-200">{subject.module?.name || 'Not assigned'}</p>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <GraduationCap className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-wide">Course</p>
                </div>
                <p className="mt-2 font-medium text-slate-200">{subject.course?.name || 'No course linked'}</p>
                {subject.course?.cbet_level ? (
                  <p className="mt-1 text-sm text-slate-600">CBET Level: {subject.course.cbet_level}</p>
                ) : null}
              </div>

              <div className="rounded-2xl bg-blue-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Assigned Trainers</p>
                <div className="mt-3 space-y-3">
                  {subject.trainers.length > 0 ? (
                    subject.trainers.map((trainer) => (
                      <div key={trainer.id} className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
                        <div className="flex items-center gap-2 text-slate-200">
                          <UserRound className="h-4 w-4 text-blue-300" />
                          <span className="font-medium">{trainer.name || 'Unnamed trainer'}</span>
                        </div>
                        {trainer.specialization ? (
                          <p className="mt-1 text-sm text-slate-600">{trainer.specialization}</p>
                        ) : null}
                        {trainer.email ? (
                          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                            <Mail className="h-4 w-4" />
                            <span>{trainer.email}</span>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">No trainer assigned yet.</p>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {subjects.length === 0 && !error ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-900 border border-slate-800 p-10 text-center text-slate-500">
          You are not enrolled in any subjects yet.
        </div>
      ) : null}
    </div>
  );
};

export default StudentSubjectsPage;
