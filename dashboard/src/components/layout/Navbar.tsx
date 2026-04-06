import { Search, Bell, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex items-center justify-between p-6 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 h-5 w-5" />
        <input
          type="text"
          placeholder="Search students, subjects, scores..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent transition-all hover:bg-white"
        />
      </div>
      <div className="flex items-center space-x-6 ml-6">
        <button className="p-2.5 rounded-lg hover:bg-gray-100 transition-colors hover:text-blue-600 relative group">
          <Bell size={20} className="text-blue-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <div className="relative group">
          <button className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center shadow-md">
              <User size={18} className="text-white" />
            </div>
            <span className="text-sm font-medium text-gray-700 hidden md:inline">{user?.name ?? 'User'}</span>
          </button>
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 p-4 space-y-2">
            <a href="#" className="block text-sm text-gray-700 hover:text-indigo-600 transition-colors">Profile</a>
            <a href="#" className="block text-sm text-gray-700 hover:text-indigo-600 transition-colors">Settings</a>
            <hr className="my-2" />
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full text-left text-sm text-red-600 hover:text-red-700 transition-colors"
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
