import { useState } from 'react';
import { Search, Bell, User, Menu, LogOut, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import theme from '../../theme/theme';

type NavbarProps = {
  onMenuClick: () => void;
};

const Navbar = ({ onMenuClick }: NavbarProps) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const notificationPath = user?.user_type === 'student'
    ? '/student/notifications'
    : user?.user_type === 'admin'
      ? '/admin/notifications'
      : '/trainer-hub';
  const profilePath = user?.user_type === 'student' ? '/student/profile' : null;

  return (
    <header className={`sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b px-3 shadow-lg shadow-blue-950/20 sm:h-[4.5rem] sm:px-4 lg:px-6 ${theme.layout.navbar}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="shrink-0 rounded-xl border border-slate-700 p-2.5 text-slate-200 transition hover:bg-slate-800 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div className="relative hidden min-w-0 max-w-md flex-1 sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-5 sm:w-5" />
        <input
          type="text"
          placeholder="Search dashboard…"
          className={`w-full rounded-xl py-2.5 pl-9 pr-3 text-sm sm:pl-10 ${theme.surface.input} focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/60 ${theme.interactive.base}`}
        />
        </div>
        <div className="truncate text-sm font-bold text-slate-100 sm:hidden">{user?.name ?? 'Dashboard'}</div>
      </div>
      <div className="ml-1 flex shrink-0 items-center gap-1 sm:ml-3 sm:gap-2">
        <button
          type="button"
          onClick={() => navigate(notificationPath)}
          className="relative rounded-xl p-2.5 transition-all duration-200 hover:bg-blue-800/70 hover:text-teal-300"
          aria-label="Open notifications"
        >
          <Bell size={20} className="text-slate-200" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
            className="flex items-center gap-2 rounded-xl p-1.5 transition-all duration-200 hover:bg-blue-800/70 sm:px-2"
            aria-expanded={profileOpen}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500 shadow-md shadow-teal-500/20">
              <User size={18} className="text-white" />
            </div>
            <span className="hidden max-w-32 truncate text-sm font-medium text-slate-200 lg:inline">{user?.name ?? 'User'}</span>
            <ChevronDown size={14} className="hidden text-slate-500 lg:block" />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
              <div className="border-b border-slate-800 px-3 py-2">
                <p className="truncate text-sm font-bold text-slate-100">{user?.name ?? 'User'}</p>
                <p className="mt-0.5 text-xs capitalize text-slate-500">{user?.user_type ?? 'Account'}</p>
              </div>
              {profilePath ? (
                <button
                  type="button"
                  onClick={() => {
                    navigate(profilePath);
                    setProfileOpen(false);
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-teal-300"
                >
                  <User size={15} />
                  Profile
                </button>
              ) : null}
            <button
              type="button"
              onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
            >
                <LogOut size={15} />
              Logout
            </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
