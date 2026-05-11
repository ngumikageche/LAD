import { Search, Bell, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import theme from '../../theme/theme';

const Navbar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className={`flex items-center justify-between p-4 sm:p-6 ${theme.layout.navbar} border-b shadow-lg shadow-blue-950/20 sticky top-0 z-40`}>
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
        <input
          type="text"
          placeholder="Search students, subjects, scores..."
          className={`w-full pl-10 pr-4 py-2.5 rounded-xl ${theme.surface.input} focus:outline-none focus:ring-2 focus:ring-teal-400/60 focus:border-teal-400 ${theme.interactive.base}`}
        />
      </div>
      <div className="flex items-center space-x-6 ml-6">
        <button className="p-2.5 rounded-xl hover:bg-blue-800/70 transition-all duration-200 hover:text-teal-300 relative group">
          <Bell size={20} className="text-slate-200" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-400 rounded-full"></span>
        </button>
        <div className="relative group">
          <button className="flex items-center space-x-3 px-3 py-2 rounded-xl hover:bg-blue-800/70 transition-all duration-200">
            <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center shadow-md shadow-teal-500/20">
              <User size={18} className="text-white" />
            </div>
            <span className="text-sm font-medium text-slate-200 hidden md:inline">{user?.name ?? 'User'}</span>
          </button>
          <div className="absolute right-0 mt-2 w-48 bg-slate-900 rounded-xl shadow-xl border border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 p-4 space-y-2">
            <a href="#" className="block text-sm text-slate-300 hover:text-teal-300 transition-colors">Profile</a>
            <a href="#" className="block text-sm text-slate-300 hover:text-teal-300 transition-colors">Settings</a>
            <hr className="my-2 border-slate-700" />
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full text-left text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
