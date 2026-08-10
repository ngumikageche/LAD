import { useCallback, useState, useEffect, useRef, type FormEvent } from 'react';
import { Bell, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Calendar, ChevronLeft, ChevronRight, RefreshCw, Send } from 'lucide-react';
import { adminNotificationsAPI } from '../api/admin';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminUser } from '../auth/ProtectedRoute';
import {
  LIST_POLL_MS,
  PAGE_SIZE_OPTIONS,
  notifyNotificationsChanged,
  useBackgroundRefresh,
  useNotificationPageSize,
} from '../hooks/useNotifications';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
}

interface NotificationForm {
  title: string;
  message: string;
  user_id: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role_name?: string | null;
}

interface ResourceOption {
  id: string;
  name: string;
}

interface StudentOption {
  id: string;
  enrollment_year?: number | string | null;
}

type ComposeMode = 'single' | 'bulk';
type BulkTarget = 'all' | 'role' | 'course' | 'module' | 'subject' | 'year';

interface BulkFilters {
  target: BulkTarget;
  role_name: string;
  course_id: string;
  module_id: string;
  subject_id: string;
  enrollment_year: string;
}

interface SmsConfig {
  enabled: boolean;
  provider: string;
  sender_id: string;
  dry_run: boolean;
}

type DeliveryChannel = 'system' | 'email' | 'sms';

const emptyForm: NotificationForm = { title: '', message: '', user_id: '' };
const emptyFilters: BulkFilters = {
  target: 'all',
  role_name: '',
  course_id: '',
  module_id: '',
  subject_id: '',
  enrollment_year: '',
};
const defaultSmsConfig: SmsConfig = {
  enabled: true,
  provider: 'manual',
  sender_id: '',
  dry_run: true,
};

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  // A trainer without master data reaches only their own learners.
  const isScopedTrainer = user?.user_type === 'trainer' && !isAdminUser(user) && user?.permissions?.['data.master'] !== true;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [courses, setCourses] = useState<ResourceOption[]>([]);
  const [modules, setModules] = useState<ResourceOption[]>([]);
  const [subjects, setSubjects] = useState<ResourceOption[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useNotificationPageSize('admin');
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterRead, setFilterRead] = useState<'all' | 'read' | 'unread'>('all');
  const [composeMode, setComposeMode] = useState<ComposeMode>('single');
  // A scoped trainer cannot use the school-wide or by-role targets, so their
  // form starts — and resets — on the narrowest one they can. Sending used to
  // reset the target back to "all", which is not an option they are offered:
  // the sub-field for picking a class disappeared and every further send was
  // rejected, leaving the composer looking broken after the first message.
  const defaultTarget: BulkTarget = isScopedTrainer ? 'subject' : 'all';
  const [bulkFilters, setBulkFilters] = useState<BulkFilters>(emptyFilters);

  // `user` arrives after the first render, so correct the target once it does.
  useEffect(() => {
    setBulkFilters((current) => (
      isScopedTrainer && (current.target === 'all' || current.target === 'role')
        ? { ...emptyFilters, target: 'subject' }
        : current
    ));
  }, [isScopedTrainer]);
  const [smsConfig, setSmsConfig] = useState<SmsConfig>(() => {
    try {
      const stored = localStorage.getItem('adminSmsConfig');
      return stored ? { ...defaultSmsConfig, ...JSON.parse(stored) } : defaultSmsConfig;
    } catch {
      return defaultSmsConfig;
    }
  });
  const [deliveryChannels, setDeliveryChannels] = useState<Record<DeliveryChannel, boolean>>({
    system: true,
    email: false,
    sms: false,
  });

  const [formData, setFormData] = useState<NotificationForm>(emptyForm);

  // Background polls must not clobber a page or filter the user just moved to.
  const requestRef = useRef(0);
  // Only the very first fetch blocks the page; later ones swap the list in place.
  const loadedOnceRef = useRef(false);

  const loadNotifications = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const requestId = ++requestRef.current;
      try {
        if (background || loadedOnceRef.current) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const data = await adminNotificationsAPI.getNotifications({ page, per_page: pageSize, status: filterRead });
        if (requestId !== requestRef.current) return;
        setNotifications(Array.isArray(data.items) ? data.items : []);
        setTotal(data.pagination?.total ?? 0);
        setTotalPages(data.pagination?.total_pages ?? 1);
        setUnreadCount(data.unread_count ?? 0);
        setLastUpdated(new Date());
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load notifications');
      } finally {
        if (requestId === requestRef.current) {
          loadedOnceRef.current = true;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [page, pageSize, filterRead]
  );

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  // Keeps the visible page current without a spinner or a lost scroll position.
  useBackgroundRefresh(() => void loadNotifications({ background: true }), LIST_POLL_MS);

  useEffect(() => {
    localStorage.setItem('adminSmsConfig', JSON.stringify(smsConfig));
  }, [smsConfig]);

  useEffect(() => {
    Promise.allSettled([
      apiRequest<UserOption[]>('/users'),
      apiRequest<ResourceOption[]>('/courses'),
      apiRequest<ResourceOption[]>('/modules'),
      apiRequest<ResourceOption[]>('/subjects'),
      apiRequest<StudentOption[]>('/students'),
    ]).then(([usersResult, coursesResult, modulesResult, subjectsResult, studentsResult]) => {
      if (usersResult.status === 'fulfilled' && Array.isArray(usersResult.value)) {
        setUsers(usersResult.value);
      }
      if (coursesResult.status === 'fulfilled' && Array.isArray(coursesResult.value)) {
        setCourses(coursesResult.value);
      }
      if (modulesResult.status === 'fulfilled' && Array.isArray(modulesResult.value)) {
        setModules(modulesResult.value);
      }
      if (subjectsResult.status === 'fulfilled' && Array.isArray(subjectsResult.value)) {
        setSubjects(subjectsResult.value);
      }
      if (studentsResult.status === 'fulfilled' && Array.isArray(studentsResult.value)) {
        const uniqueYears = Array.from(
          new Set(
            studentsResult.value
              .map((student) => student.enrollment_year)
              .filter((year): year is string | number => year !== null && year !== undefined && year !== '')
              .map(String)
          )
        ).sort((a, b) => Number(b) - Number(a));
        setYears(uniqueYears);
      }
    });
  }, []);

  const roleNames = Array.from(new Set(users.map((u) => u.role_name).filter(Boolean) as string[])).sort();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      setError('Title and message are required');
      return;
    }
    const selectedChannels = (Object.entries(deliveryChannels)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel) as DeliveryChannel[]);
    if (selectedChannels.length === 0) {
      setError('Select at least one delivery channel');
      return;
    }
    try {
      setError(null);
      if (editingId) {
        await adminNotificationsAPI.updateNotification(editingId, { title: formData.title, message: formData.message });
        setSuccess('Notification updated successfully!');
      } else if (composeMode === 'bulk') {
        const result = await adminNotificationsAPI.createBulkNotification({
          title: formData.title,
          message: formData.message,
          filters: {
            target: bulkFilters.target,
            role_name: bulkFilters.role_name || undefined,
            course_id: bulkFilters.course_id || undefined,
            module_id: bulkFilters.module_id || undefined,
            subject_id: bulkFilters.subject_id || undefined,
            enrollment_year: bulkFilters.enrollment_year || undefined,
          },
          delivery_channels: selectedChannels,
          sms_config: smsConfig,
        }) as { recipient_count?: number; delivery_channels?: string[]; system?: { created_count?: number }; email?: { email_ready_count?: number; skipped_no_email_count?: number }; sms?: { phone_ready_count?: number; skipped_no_phone_count?: number } };
        const recipientCount = result.recipient_count ?? 0;
        const systemCreated = result.system?.created_count ?? 0;
        const emailReady = result.email?.email_ready_count ?? 0;
        const noEmail = result.email?.skipped_no_email_count ?? 0;
        const phoneReady = result.sms?.phone_ready_count ?? 0;
        const noPhone = result.sms?.skipped_no_phone_count ?? 0;
        setSuccess(`Bulk message processed for ${recipientCount} users via ${(result.delivery_channels || selectedChannels).join(', ')}. System: ${systemCreated}; email-ready: ${emailReady}/${recipientCount}; SMS-ready: ${phoneReady}/${recipientCount}. Missing email: ${noEmail}; missing phone: ${noPhone}.`);
      } else {
        if (!formData.user_id.trim()) { setError('User ID is required'); return; }
        const result = await adminNotificationsAPI.createNotification({
          title: formData.title,
          message: formData.message,
          user_id: formData.user_id,
          delivery_channels: selectedChannels,
        }) as { delivery_channels?: string[]; delivery_summary?: { system?: { created?: boolean } } };
        setSuccess(`Message processed via ${(result.delivery_channels || selectedChannels).join(', ')}${result.delivery_summary?.system?.created ? ' with an in-app notification created.' : '.'}`);
      }
      resetForm();
      setPage(1);
      await loadNotifications({ background: true });
      notifyNotificationsChanged();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification');
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setBulkFilters({ ...emptyFilters, target: defaultTarget });
    setComposeMode('single');
    setDeliveryChannels({ system: true, email: false, sms: false });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (n: Notification) => {
    setFormData({ title: n.title, message: n.message, user_id: n.user_id });
    setComposeMode('single');
    setEditingId(n.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    try {
      await adminNotificationsAPI.deleteNotification(id);
      setSuccess('Notification deleted!');
      // The page is server-side, so pull the replacement row in.
      await loadNotifications({ background: true });
      notifyNotificationsChanged();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification');
    }
  };

  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

  const changeFilter = (next: 'all' | 'read' | 'unread') => {
    setFilterRead(next);
    setPage(1);
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = (page - 1) * pageSize + notifications.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
              <Bell size={32} className="text-purple-500" />
              Notifications Management
            </h1>
            <p className="text-slate-400 mt-2">Send notifications and prepare bulk SMS messages for targeted groups</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center gap-2"
          >
            <Plus size={20} />
            New Message
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
            <AlertCircle size={20} />{error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-300">
            <CheckCircle2 size={20} />{success}
          </div>
        )}

        <div className="mb-6 bg-slate-900 border border-slate-800 rounded-lg shadow p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Send size={18} className="text-purple-400" />
                Bulk SMS Config
              </h2>
              <p className="text-sm text-slate-400 mt-1">Saved in this browser and sent with each bulk message request.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <input
                type="checkbox"
                checked={smsConfig.enabled}
                onChange={(e) => setSmsConfig({ ...smsConfig, enabled: e.target.checked })}
                className="h-4 w-4 rounded accent-purple-500"
              />
              Enable SMS preview
            </label>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Provider</label>
              <select
                value={smsConfig.provider}
                onChange={(e) => setSmsConfig({ ...smsConfig, provider: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="manual">Manual / CSV export</option>
                <option value="africastalking">Africa's Talking</option>
                <option value="twilio">Twilio</option>
                <option value="custom">Custom Gateway</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Sender ID</label>
              <input
                type="text"
                value={smsConfig.sender_id}
                onChange={(e) => setSmsConfig({ ...smsConfig, sender_id: e.target.value })}
                placeholder="School name or approved sender"
                className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 md:pt-8">
              <input
                type="checkbox"
                checked={smsConfig.dry_run}
                onChange={(e) => setSmsConfig({ ...smsConfig, dry_run: e.target.checked })}
                className="h-4 w-4 rounded accent-purple-500"
              />
              Dry run only
            </label>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
                <h2 className="text-xl font-bold text-slate-100">
                  {editingId ? 'Edit Notification' : 'Create Message'}
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-100 text-2xl">×</button>
              </div>
              <form onSubmit={handleSubmit} className="min-h-0 flex flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
                {!editingId && (
                  <>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-800/70 p-1">
                      {(['single', 'bulk'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setComposeMode(mode)}
                          className={`rounded-md px-3 py-2 text-sm font-semibold capitalize transition ${
                            composeMode === mode ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {mode === 'single' ? 'One user' : 'Bulk group'}
                        </button>
                      ))}
                    </div>

                    {composeMode === 'single' ? (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Target User</label>
                        <select
                          value={formData.user_id}
                          onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          <option value="">- Select user -</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Send To</label>
                          <select
                            value={bulkFilters.target}
                            onChange={(e) => setBulkFilters({ ...emptyFilters, target: e.target.value as BulkTarget })}
                            className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          >
                            {/* A scoped trainer may only reach the learners they
                                teach; the API refuses the wide targets for them,
                                so offering those here would only produce an
                                error after they had typed the message. */}
                            {!isScopedTrainer && <option value="all">All active users</option>}
                            {!isScopedTrainer && <option value="role">Certain role/group</option>}
                            <option value="course">Students in course</option>
                            <option value="module">Students in module</option>
                            <option value="subject">Students in subject</option>
                            <option value="year">Students by enrollment year</option>
                          </select>
                          {isScopedTrainer && (
                            <p className="mt-2 text-xs text-slate-500">
                              Recipients are limited to learners in the subjects assigned to you.
                            </p>
                          )}
                        </div>

                        {bulkFilters.target === 'role' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Role / Group</label>
                            <select
                              value={bulkFilters.role_name}
                              onChange={(e) => setBulkFilters({ ...bulkFilters, role_name: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              <option value="">- Select role -</option>
                              {roleNames.map((role) => <option key={role} value={role}>{role}</option>)}
                            </select>
                          </div>
                        )}

                        {bulkFilters.target === 'course' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Course</label>
                            <select
                              value={bulkFilters.course_id}
                              onChange={(e) => setBulkFilters({ ...bulkFilters, course_id: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              <option value="">- Select course -</option>
                              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                            </select>
                          </div>
                        )}

                        {bulkFilters.target === 'module' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Module</label>
                            <select
                              value={bulkFilters.module_id}
                              onChange={(e) => setBulkFilters({ ...bulkFilters, module_id: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              <option value="">- Select module -</option>
                              {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                            </select>
                          </div>
                        )}

                        {bulkFilters.target === 'subject' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
                            <select
                              value={bulkFilters.subject_id}
                              onChange={(e) => setBulkFilters({ ...bulkFilters, subject_id: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              <option value="">- Select subject -</option>
                              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                            </select>
                          </div>
                        )}

                        {bulkFilters.target === 'year' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Enrollment Year</label>
                            <select
                              value={bulkFilters.enrollment_year}
                              onChange={(e) => setBulkFilters({ ...bulkFilters, enrollment_year: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              <option value="">- Select year -</option>
                              {years.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Notification title"
                    className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Notification message"
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                {!editingId && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-200">Delivery Channels</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {(['system', 'email', 'sms'] as const).map((channel) => (
                        <label key={channel} className="flex items-center gap-2 text-sm text-slate-300 capitalize">
                          <input
                            type="checkbox"
                            checked={deliveryChannels[channel]}
                            onChange={(e) => setDeliveryChannels((current) => ({ ...current, [channel]: e.target.checked }))}
                            className="h-4 w-4 rounded accent-purple-500"
                          />
                          {channel}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      `System` creates in-app notifications. `Email` and `SMS` use the recipient contact data on file.
                    </p>
                  </div>
                )}
                </div>
                <div className="flex gap-4 p-6 border-t border-slate-800 shrink-0">
                  <button type="submit" className="flex-1 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium">
                    {editingId ? 'Update' : composeMode === 'bulk' ? 'Create Bulk Message' : 'Create'}
                  </button>
                  <button type="button" onClick={resetForm} className="px-6 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition font-medium">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 bg-slate-900 border border-slate-800 p-4 rounded-lg shadow flex flex-wrap items-center gap-4">
          {(['all', 'unread', 'read'] as const).map((f) => (
            <button
              key={f}
              onClick={() => changeFilter(f)}
              className={`px-4 py-2 rounded-lg capitalize font-medium transition ${filterRead === f ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              {f}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Show
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            per page
          </label>
          <button
            type="button"
            onClick={() => void loadNotifications({ background: true })}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <span className="ml-auto text-sm text-slate-500 self-center">
            {total > 0 ? `${rangeStart}–${rangeEnd} of ${total}` : '0'} notifications · {unreadCount} unread
            {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
          </span>
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-lg">
              <Bell size={48} className="mx-auto text-slate-500 mb-4" />
              <p className="text-slate-500 text-lg">No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-lg shadow p-5 ${
                notification.is_read
                  ? 'bg-slate-900 border border-slate-800'
                  : 'bg-purple-500/10 border border-purple-500/30 border-l-4 border-l-purple-500'
              }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-100">{notification.title}</h3>
                      {!notification.is_read && (
                        <span className="px-2 py-0.5 bg-purple-500/15 text-purple-300 text-xs rounded-full font-medium">Unread</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm">{notification.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span>User: {notification.user_id.slice(0, 8)}...</span>
                      {notification.created_at && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(notification.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleEdit(notification)}
                      className="p-2 bg-amber-500/15 text-amber-300 rounded hover:bg-amber-500/25 transition"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(notification.id)}
                      className="p-2 bg-red-500/15 text-red-300 rounded hover:bg-red-500/25 transition"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-lg">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-4 py-2 bg-slate-800 text-slate-200 rounded-lg font-medium transition hover:bg-slate-700 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Newer
            </button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-4 py-2 bg-slate-800 text-slate-200 rounded-lg font-medium transition hover:bg-slate-700 disabled:opacity-40"
            >
              Older
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
