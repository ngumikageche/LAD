import { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  Lock,
  Save,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { profileAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile data
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await profileAPI.getProfile();
        setProfile(data);
        setFormData({
          name: data.name,
          email: data.email,
          phone: data.phone || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleUpdateProfile = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      setError(null);
      await profileAPI.updateStudentProfile(profile.id, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
      });
      setSuccess('Profile updated successfully!');
      setEditMode(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update profile'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      if (passwordForm.newPassword.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      setSaving(true);
      setError(null);
      await profileAPI.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      );
      setSuccess('Password changed successfully!');
      setShowPasswordForm(false);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <User size={32} className="text-blue-500" />
            My Profile
          </h1>
          <p className="text-slate-400 mt-2">
            Manage your personal information and security
          </p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle2 size={20} />
            {success}
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-md p-8 mb-6">
          <div className="flex items-center gap-4 mb-8 pb-8 border-b">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
              {profile?.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-100">
                {profile?.name}
              </h2>
              <p className="text-slate-400">{profile?.email}</p>
            </div>
          </div>

          {/* Profile Form */}
          {editMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <User size={16} className="inline mr-2" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Mail size={16} className="inline mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Phone size={16} className="inline mr-2" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={handleUpdateProfile}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-slate-800 rounded-lg">
                <div>
                  <p className="text-slate-400 text-sm">Full Name</p>
                  <p className="text-slate-100 font-medium">{profile?.name}</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-slate-800 rounded-lg">
                <div>
                  <p className="text-slate-400 text-sm">Email</p>
                  <p className="text-slate-100 font-medium">{profile?.email}</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-slate-800 rounded-lg">
                <div>
                  <p className="text-slate-400 text-sm">Phone Number</p>
                  <p className="text-slate-100 font-medium">
                    {profile?.phone || 'Not provided'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditMode(true)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Edit Profile
              </button>
            </div>
          )}
        </div>

        {/* Security Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-md p-8">
          <h3 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
            <Lock size={24} className="text-red-500" />
            Security
          </h3>

          {showPasswordForm ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={handleChangePassword}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Change Password'}
                </button>
                <button
                  onClick={() => setShowPasswordForm(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="w-full px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition font-medium"
            >
              Change Password
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
