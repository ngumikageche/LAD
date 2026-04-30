import { useState, useEffect } from 'react';
import { Bell, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { adminNotificationsAPI } from '../api/admin';

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

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterRead, setFilterRead] = useState<'all' | 'read' | 'unread'>('all');

  const [formData, setFormData] = useState<NotificationForm>({ title: '', message: '', user_id: '' });

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminNotificationsAPI.getNotifications() as Notification[];
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      setError('Title and message are required');
      return;
    }
    try {
      setError(null);
      if (editingId) {
        await adminNotificationsAPI.updateNotification(editingId, { title: formData.title, message: formData.message });
        setSuccess('Notification updated successfully!');
      } else {
        if (!formData.user_id.trim()) { setError('User ID is required'); return; }
        await adminNotificationsAPI.createNotification({ title: formData.title, message: formData.message, user_id: formData.user_id });
        setSuccess('Notification created successfully!');
      }
      resetForm();
      await loadNotifications();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification');
    }
  };

  const resetForm = () => {
    setFormData({ title: '', message: '', user_id: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (n: Notification) => {
    setFormData({ title: n.title, message: n.message, user_id: n.user_id });
    setEditingId(n.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    try {
      await adminNotificationsAPI.deleteNotification(id);
      setNotifications(notifications.filter((n) => n.id !== id));
      setSuccess('Notification deleted!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification');
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filterRead === 'read') return n.is_read;
    if (filterRead === 'unread') return !n.is_read;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Bell size={32} className="text-purple-500" />
              Notifications Management
            </h1>
            <p className="text-gray-600 mt-2">Send and manage notifications to system users</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center gap-2"
          >
            <Plus size={20} />
            New Notification
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />{error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle2 size={20} />{success}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-lg w-full">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Notification' : 'Create Notification'}
                </h2>
                <button onClick={resetForm} className="text-gray-600 hover:text-gray-900 text-2xl">×</button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {!editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
                    <input
                      type="text"
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      placeholder="UUID of the target user"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Notification title"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Notification message"
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-4 pt-4 border-t">
                  <button type="submit" className="flex-1 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium">
                    {editingId ? 'Update' : 'Create'}
                  </button>
                  <button type="button" onClick={resetForm} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow flex gap-4">
          {(['all', 'unread', 'read'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterRead(f)}
              className={`px-4 py-2 rounded-lg capitalize font-medium transition ${filterRead === f ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {f}
            </button>
          ))}
          <span className="ml-auto text-sm text-gray-500 self-center">{filteredNotifications.length} notifications</span>
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg">
              <Bell size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">No notifications</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-lg shadow p-5 ${notification.is_read ? 'bg-white' : 'bg-purple-50 border-l-4 border-purple-500'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900">{notification.title}</h3>
                      {!notification.is_read && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Unread</span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm">{notification.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
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
                      className="p-2 bg-amber-100 text-amber-600 rounded hover:bg-amber-200 transition"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(notification.id)}
                      className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
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
      </div>
    </div>
  );
}
