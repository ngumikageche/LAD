import { useState, useEffect } from 'react';
import { Bell, Calendar, Flag, Eye, EyeOff } from 'lucide-react';
import { announcementsAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface Announcement {
  id: string;
  title: string;
  content: string;
  creator_id: string;
  is_important: boolean;
  is_published: boolean;
  course_id?: string;
  created_at: string;
  read_at?: string;
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'important' | 'unread'>(
    'all'
  );
  const [readAnnouncements, setReadAnnouncements] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await announcementsAPI.getStudentAnnouncements(
          user?.id || ''
        );
        setAnnouncements(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load announcements'
        );
      } finally {
        setLoading(false);
      }
    };

    loadAnnouncements();
  }, [user?.id]);

  const handleMarkAsRead = async (announcementId: string) => {
    try {
      await announcementsAPI.markAsRead(announcementId);
      setReadAnnouncements((prev) => new Set([...prev, announcementId]));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const filteredAnnouncements = announcements.filter((ann) => {
    if (filter === 'important') return ann.is_important;
    if (filter === 'unread') return !readAnnouncements.has(ann.id);
    return true;
  });

  const unreadCount = announcements.filter(
    (ann) => !readAnnouncements.has(ann.id)
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Bell size={32} className="text-blue-500" />
                Announcements
              </h1>
              <p className="text-gray-600 mt-2">
                Stay updated with the latest news and academic updates
              </p>
            </div>
            {unreadCount > 0 && (
              <div className="bg-red-500 text-white rounded-full px-4 py-2 font-bold">
                {unreadCount} new
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-gray-600 text-sm">Total</p>
            <p className="text-2xl font-bold text-gray-900">
              {announcements.length}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-4 text-center">
            <p className="text-red-700 text-sm">Important</p>
            <p className="text-2xl font-bold text-red-700">
              {announcements.filter((a) => a.is_important).length}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4 text-center">
            <p className="text-blue-700 text-sm">Unread</p>
            <p className="text-2xl font-bold text-blue-700">{unreadCount}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'important', 'unread'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Announcements List */}
        {filteredAnnouncements.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Bell size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No announcements</p>
            <p className="text-gray-400">
              {filter === 'unread'
                ? 'You have read all announcements'
                : 'Check back soon for updates'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAnnouncements.map((announcement) => {
              const isRead = readAnnouncements.has(announcement.id);
              return (
                <div
                  key={announcement.id}
                  className={`rounded-lg shadow transition hover:shadow-lg ${
                    isRead ? 'bg-white' : 'bg-blue-50 border-2 border-blue-200'
                  }`}
                >
                  <div className="p-6">
                    {/* Title & Meta */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h2
                            className={`text-lg font-bold ${
                              isRead ? 'text-gray-900' : 'text-blue-900'
                            }`}
                          >
                            {announcement.title}
                          </h2>
                          {announcement.is_important && (
                            <Flag
                              size={18}
                              className="text-red-500 fill-red-500"
                            />
                          )}
                          {!isRead && (
                            <span className="inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar size={14} />
                            {new Date(announcement.created_at).toLocaleDateString()}
                          </div>
                          {isRead ? (
                            <div className="flex items-center gap-1">
                              <Eye size={14} />
                              Read
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <EyeOff size={14} />
                              Unread
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mark as Read Button */}
                      {!isRead && (
                        <button
                          onClick={() => handleMarkAsRead(announcement.id)}
                          className="ml-4 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>

                    {/* Content */}
                    <p className="text-gray-700 leading-relaxed">
                      {announcement.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Importance Legend */}
        <div className="mt-8 p-4 bg-white rounded-lg shadow text-sm text-gray-600 flex items-center gap-2">
          <Flag size={16} className="text-red-500 fill-red-500" />
          <span>Important announcements are marked with a flag</span>
        </div>
      </div>
    </div>
  );
}
