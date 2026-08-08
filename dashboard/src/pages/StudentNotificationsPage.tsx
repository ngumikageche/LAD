import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, Megaphone, RefreshCw } from 'lucide-react';
import { studentApi, type StudentAnnouncement, type StudentNotification } from '../services/studentApi';
import {
  LIST_POLL_MS,
  PAGE_SIZE_OPTIONS,
  notifyNotificationsChanged,
  useBackgroundRefresh,
  useNotificationPageSize,
} from '../hooks/useNotifications';

const StudentNotificationsPage = () => {
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pageSize, setPageSize] = useNotificationPageSize('student');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');
  // Background polls must not clobber a page the user just navigated away from.
  const requestRef = useRef(0);
  // Only the very first fetch blocks the page; later ones swap the list in place.
  const loadedOnceRef = useRef(false);

  const loadData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const requestId = ++requestRef.current;
      try {
        if (background || loadedOnceRef.current) setRefreshing(true);
        else setLoading(true);
        setError('');
        const [notificationResponse, announcementResponse] = await Promise.all([
          studentApi.getNotifications(page, pageSize),
          studentApi.getAnnouncements(1, 10),
        ]);
        if (requestId !== requestRef.current) return;
        setNotifications(notificationResponse.items);
        setUnreadCount(notificationResponse.unread_count);
        setTotal(notificationResponse.pagination?.total ?? notificationResponse.items.length);
        setTotalPages(notificationResponse.pagination?.total_pages ?? 1);
        setAnnouncements(announcementResponse.items);
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
    [page, pageSize]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Keeps the visible page current without a spinner or a lost scroll position.
  useBackgroundRefresh(() => void loadData({ background: true }), LIST_POLL_MS);

  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await studentApi.markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      notifyNotificationsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-slate-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Notifications</h1>
          <p className="mt-2 text-slate-600">Stay up to date with new scores, alerts, and school announcements.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            Show
            <select
              value={pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"
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
            onClick={() => void loadData({ background: true })}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="rounded-3xl bg-slate-900 px-6 py-4 text-white shadow-sm">
            <p className="text-sm text-slate-300">Unread notifications</p>
            <p className="mt-1 text-3xl font-bold">{unreadCount}</p>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <BellRing className="h-6 w-6 text-slate-700" />
            <h2 className="text-2xl font-semibold text-slate-100">My Alerts</h2>
            <span className="ml-auto text-xs text-slate-500">
              {total > 0
                ? `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + notifications.length} of ${total}`
                : 'Nothing to show'}
              {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
            </span>
          </div>

          <div className="space-y-4">
            {notifications.map((notification) => {
              const isPracticalAssessment = notification.title.toLowerCase().includes('practical assessment');
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 ${
                    notification.read ? 'border-slate-700 bg-slate-800/60' : 'border-amber-500/30 bg-amber-500/10'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isPracticalAssessment ? 'bg-teal-400/10 text-teal-300' : 'bg-amber-400/10 text-amber-300'
                      }`}>
                        {isPracticalAssessment ? <ClipboardCheck size={19} /> : <Bell size={19} />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">{notification.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{notification.message}</p>
                        <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                          {notification.created_at ? new Date(notification.created_at).toLocaleString() : 'Unknown time'}
                        </p>
                        {isPracticalAssessment ? (
                          <Link
                            to="/student/practical-assessments"
                            onClick={() => {
                              if (!notification.read) void markAsRead(notification.id);
                            }}
                            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-teal-300 hover:text-teal-200"
                          >
                            View practical assessment
                            <ChevronRight size={15} />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    {!notification.read ? (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        <CheckCheck className="h-4 w-4" />
                        Mark as read
                      </button>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-slate-500">
                        <Bell className="h-4 w-4" />
                        Read
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No notifications available.
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Newer
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
              >
                Older
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 border border-slate-800 p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-slate-700" />
            <h2 className="text-2xl font-semibold text-slate-100">Announcements</h2>
          </div>

          <div className="space-y-4">
            {announcements.map((announcement) => (
              <article key={announcement.id} className="rounded-2xl border border-slate-700 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-100">{announcement.title}</h3>
                    <p className="mt-2 text-sm text-slate-700">{announcement.message}</p>
                    <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                      {announcement.created_at ? new Date(announcement.created_at).toLocaleString() : 'Unknown time'}
                    </p>
                  </div>
                  {announcement.is_important ? (
                    <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">Important</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {announcements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No announcements available.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default StudentNotificationsPage;
