import { useState, useEffect } from 'react';
import { Bell, Plus, Edit2, Trash2, Send, CheckCircle2, AlertCircle, Calendar, Users } from 'lucide-react';
import { adminNotificationsAPI } from '../api/admin';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'alert' | 'warning' | 'success';
  audience: 'all' | 'students' | 'trainers' | 'admins';
  status: 'draft' | 'sent' | 'scheduled';
  send_at?: string;
  created_at: string;
  read_count: number;
  total_recipients: number;
}

interface NotificationForm {
  title: string;
  message: string;
  type: 'info' | 'alert' | 'warning' | 'success';
  audience: 'all' | 'students' | 'trainers' | 'admins';
  status: 'draft' | 'sent';
  send_at?: string;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Term Registration Reminder',
    message: 'Please complete your term registration before the deadline.',
    type: 'info',
    audience: 'students',
    status: 'sent',
    created_at: '2026-04-15T10:00:00Z',
    read_count: 850,
    total_recipients: 1250,
  },
  {
    id: '2',
    title: 'New Exam Schedule Released',
    message: 'Final exam schedule is now available. Check your portal.',
    type: 'alert',
    audience: 'all',
    status: 'sent',
    created_at: '2026-04-14T14:30:00Z',
    read_count: 2100,
    total_recipients: 2200,
  },
  {
    id: '3',
    title: 'System Update Coming',
    message: 'System maintenance scheduled for April 20. Expected downtime: 2 hours.',
    type: 'warning',
    audience: 'all',
    status: 'sent',
    created_at: '2026-04-10T09:00:00Z',
    read_count: 3200,
    total_recipients: 3500,
  },
];

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent' | 'scheduled'>('all');
  const [filterType, setFilterType] = useState<'all' | 'info' | 'alert' | 'warning' | 'success'>('all');

  const [formData, setFormData] = useState<NotificationForm>({
    title: '',
    message: '',
    type: 'info',
    audience: 'all',
    status: 'sent',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      setError('Title and message are required');
      return;
    }

    try {
      setError(null);
      
      if (editingId) {
        // Update
        await adminNotificationsAPI.updateNotification(editingId, formData);
        setNotifications(
          notifications.map((n) =>
            n.id === editingId
              ? {
                  ...n,
                  title: formData.title,
                  message: formData.message,
                  type: formData.type,
                  audience: formData.audience,
                  status: formData.status,
                }
              : n
          )
        );
        setSuccess('Notification updated successfully!');
      } else {
        // Create
        const newNotification: Notification = {
          id: String(Date.now()),
          title: formData.title,
          message: formData.message,
          type: formData.type,
          audience: formData.audience,
          status: formData.status,
          send_at: formData.send_at,
          created_at: new Date().toISOString(),
          read_count: 0,
          total_recipients: 0,
        };
        setNotifications([newNotification, ...notifications]);
        setSuccess('Notification created successfully!');
      }

      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification');
    }
  };

  const resetForm = () => {
    setFormData({ title: '', message: '', type: 'info', audience: 'all', status: 'sent' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (notification: Notification) => {
    setFormData({
      title: notification.title,
      message: notification.message,
      type: notification.type,
      audience: notification.audience,
      status: notification.status,
    });
    setEditingId(notification.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    
    try {
      await adminNotificationsAPI.deleteNotification(id);
      setNotifications(notifications.filter((n) => n.id !== id));
      setSuccess('Notification deleted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await adminNotificationsAPI.sendNotification(id);
      setNotifications(
        notifications.map((n) =>
          n.id === id ? { ...n, status: 'sent' } : n
        )
      );
      setSuccess('Notification sent successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    const statusMatch = filterStatus === 'all' || n.status === filterStatus;
    const typeMatch = filterType === 'all' || n.type === filterType;
    return statusMatch && typeMatch;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info':
        return { bg: 'bg-blue-100', text: 'text-blue-800', icon: 'ℹ️' };
      case 'alert':
        return { bg: 'bg-orange-100', text: 'text-orange-800', icon: '🔔' };
      case 'warning':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⚠️' };
      case 'success':
        return { bg: 'bg-green-100', text: 'text-green-800', icon: '✓' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', icon: '•' };
    }
  };

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
            <p className="text-gray-600 mt-2">Send alerts and notifications to all system users</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center gap-2"
          >
            <Plus size={20} />
            New Notification
          </button>
        </div>

        {/* Alerts */}
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

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingId ? 'Edit Notification' : 'Create New Notification'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-600 hover:text-gray-900 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Notification title"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    placeholder="Notification message"
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Type and Audience */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value as any })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="info">Information</option>
                      <option value="alert">Alert</option>
                      <option value="warning">Warning</option>
                      <option value="success">Success</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Audience
                    </label>
                    <select
                      value={formData.audience}
                      onChange={(e) =>
                        setFormData({ ...formData, audience: e.target.value as any })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="all">All Users</option>
                      <option value="students">Students Only</option>
                      <option value="trainers">Trainers Only</option>
                      <option value="admins">Admins Only</option>
                    </select>
                  </div>
                </div>

                {/* Status and Schedule */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({ ...formData, status: e.target.value as any })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Send Now</option>
                    </select>
                  </div>

                  {formData.status === 'sent' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Schedule (Optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.send_at || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, send_at: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  )}
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-4 pt-4 border-t">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
                  >
                    {editingId ? 'Update' : 'Create'} & Send
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="scheduled">Scheduled</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="info">Information</option>
            <option value="alert">Alert</option>
            <option value="warning">Warning</option>
            <option value="success">Success</option>
          </select>
        </div>

        {/* Notifications List */}
        <div className="space-y-4">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg">
              <Bell size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">No notifications</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const typeColor = getTypeColor(notification.type);
              const readPercentage = (notification.read_count / notification.total_recipients) * 100;

              return (
                <div
                  key={notification.id}
                  className={`rounded-lg shadow p-6 ${typeColor.bg}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4 flex-1">
                      <span className="text-2xl">{typeColor.icon}</span>
                      <div>
                        <h3 className={`text-lg font-bold ${typeColor.text}`}>
                          {notification.title}
                        </h3>
                        <p className={`text-sm ${typeColor.text} opacity-75 mt-1`}>
                          {notification.message}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${
                      notification.status === 'sent'
                        ? 'bg-green-100 text-green-800'
                        : notification.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}>
                      {notification.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 py-4 border-t border-current border-opacity-20">
                    <div>
                      <p className="text-xs font-medium opacity-75 mb-1">Audience</p>
                      <p className={`font-semibold text-sm ${typeColor.text}`}>
                        <Users size={16} className="inline mr-1" />
                        {notification.audience}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium opacity-75 mb-1">Recipients</p>
                      <p className={`font-semibold text-sm ${typeColor.text}`}>
                        {notification.total_recipients}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium opacity-75 mb-1">Read Rate</p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${readPercentage}%` }}
                        ></div>
                      </div>
                      <p className={`font-semibold text-xs mt-1 ${typeColor.text}`}>
                        {notification.read_count}/{notification.total_recipients}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium opacity-75 mb-1">Created</p>
                      <p className={`font-semibold text-sm ${typeColor.text}`}>
                        <Calendar size={16} className="inline mr-1" />
                        {new Date(notification.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-current border-opacity-20">
                    {notification.status === 'draft' && (
                      <button
                        onClick={() => handleSend(notification.id)}
                        className={`px-4 py-2 ${typeColor.bg} border border-current border-opacity-50 rounded-lg hover:opacity-80 transition font-medium flex items-center gap-2`}
                      >
                        <Send size={18} />
                        Send Now
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(notification)}
                      className={`px-4 py-2 ${typeColor.bg} border border-current border-opacity-50 rounded-lg hover:opacity-80 transition font-medium flex items-center gap-2`}
                    >
                      <Edit2 size={18} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(notification.id)}
                      className="px-4 py-2 bg-red-100 border border-red-300 text-red-700 rounded-lg hover:bg-red-200 transition font-medium flex items-center gap-2"
                    >
                      <Trash2 size={18} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
