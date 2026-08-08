import { useCallback, useEffect, useRef, useState } from 'react';
import { adminNotificationsAPI } from '../api/admin';
import { studentApi } from '../services/studentApi';
import { useAuth } from '../auth/AuthContext';

/** The page sizes offered on the notifications pages; the server caps per_page at 100. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 10;

/** How often the header badge and the notification lists refresh themselves. */
export const COUNT_POLL_MS = 60_000;
export const LIST_POLL_MS = 60_000;

const PAGE_SIZE_STORAGE_PREFIX = 'lad.notifications.pageSize';

/**
 * Lets a notifications page tell the header badge to re-count immediately,
 * instead of leaving it stale until the next poll.
 */
const NOTIFICATIONS_CHANGED_EVENT = 'lad:notifications-changed';

export const notifyNotificationsChanged = () => {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
};

const readStoredPageSize = (scope: string): number => {
  const stored = Number(localStorage.getItem(`${PAGE_SIZE_STORAGE_PREFIX}.${scope}`));
  return PAGE_SIZE_OPTIONS.includes(stored) ? stored : DEFAULT_PAGE_SIZE;
};

/**
 * Page size the user picked, remembered per scope (student / admin).
 *
 * Defaults back to 10 so a fresh visit always opens on the latest 10.
 */
export const useNotificationPageSize = (scope: string) => {
  const [pageSize, setPageSizeState] = useState(() => readStoredPageSize(scope));

  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      localStorage.setItem(`${PAGE_SIZE_STORAGE_PREFIX}.${scope}`, String(next));
    },
    [scope]
  );

  return [pageSize, setPageSize] as const;
};

/**
 * Runs `callback` on an interval, but only while the tab is visible, and once
 * more the moment the user comes back to it. Keeps background polling from
 * piling up requests against a tab nobody is looking at.
 *
 * With `immediate`, it also fires once as soon as it is enabled.
 */
export const useBackgroundRefresh = (
  callback: () => void,
  intervalMs: number,
  enabled = true,
  immediate = false
) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    if (immediate) callbackRef.current();
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs, enabled, immediate]);
};

/**
 * Unread count for the header bell, fetched in the background.
 *
 * Students read their own counter from the student portal; everyone else uses
 * the shared endpoint, which needs `notifications.read`. Failures are
 * swallowed — a missing badge should never surface an error in the navbar.
 */
export const useNotificationCount = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const isStudent = user?.user_type === 'student';
  const canRead = isStudent || Boolean(user?.permissions?.['notifications.read']);

  const refresh = useCallback(async () => {
    if (!user || !canRead) return;
    try {
      const summary = isStudent
        ? await studentApi.getNotificationsSummary()
        : await adminNotificationsAPI.getUnreadCount();
      setUnreadCount(summary.unread_count ?? 0);
    } catch {
      // Badge stays at its last known value.
    }
  }, [user, canRead, isStudent]);

  useEffect(() => {
    if (!user || !canRead) return;

    const onChanged = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [user, canRead, refresh]);

  // Fetches once on sign-in, then keeps polling in the background.
  useBackgroundRefresh(() => void refresh(), COUNT_POLL_MS, Boolean(user) && canRead, true);

  // Derived rather than reset in an effect, so a signed-out or unprivileged
  // viewer never sees a leftover count.
  return { unreadCount: user && canRead ? unreadCount : 0, refresh };
};
