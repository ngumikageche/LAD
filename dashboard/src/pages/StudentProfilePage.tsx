import { type FormEvent, useEffect, useState } from 'react';
import { KeyRound, Save, UserCircle2 } from 'lucide-react';
import { studentApi, type StudentProfile } from '../services/studentApi';

const StudentProfilePage = () => {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await studentApi.getProfile();
        setProfile(response);
        setProfileForm({
          name: response.name || '',
          email: response.email || '',
          phone: response.phone || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSavingProfile(true);
      setError('');
      setSuccessMessage('');
      const updated = await studentApi.updateProfile({
        name: profileForm.name,
        email: profileForm.email,
        phone: profileForm.phone.trim() ? profileForm.phone.trim() : null,
      });
      setProfile(updated);
      setSuccessMessage('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSavingPassword(true);
      setError('');
      setSuccessMessage('');
      await studentApi.changePassword(passwordForm);
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setSuccessMessage('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900">My Profile</h1>
        <p className="mt-2 text-slate-600">Manage your contact details and account security.</p>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{successMessage}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="rounded-3xl bg-slate-100 p-4 text-slate-700">
              <UserCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{profile?.name || 'Student'}</h2>
              <p className="text-slate-600">Registration: {profile?.registration_number}</p>
            </div>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Course</p>
              <p className="mt-2 font-medium text-slate-800">{profile?.course?.name || 'Not assigned'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment Year</p>
              <p className="mt-2 font-medium text-slate-800">{profile?.enrollment_year ?? 'N/A'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CBET Level</p>
              <p className="mt-2 font-medium text-slate-800">{profile?.course?.cbet_level || 'N/A'}</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={saveProfile}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Full Name</label>
              <input
                value={profileForm.name}
                onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email Address</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Phone Number</label>
              <input
                value={profileForm.phone}
                onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                placeholder="Optional"
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-3xl bg-amber-50 p-4 text-amber-700">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Change Password</h2>
              <p className="text-slate-600">Use a strong password with at least 8 characters.</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={savePassword}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Current Password</label>
              <input
                type="password"
                value={passwordForm.current_password}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, current_password: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default StudentProfilePage;
