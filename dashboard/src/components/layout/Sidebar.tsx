import { Link, useLocation } from 'react-router-dom';
import { Book, Home, Users, BarChart, FileText, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { name: 'Dashboard', icon: Home, path: '/', color: 'text-indigo-600' },
  { name: 'Students', icon: Users, path: '/students', color: 'text-blue-600' },
  { name: 'Subjects', icon: Book, path: '/subjects', color: 'text-amber-600' },
  { name: 'Progress', icon: BarChart, path: '/progress', color: 'text-emerald-600' },
  { name: 'Reports', icon: FileText, path: '/reports', color: 'text-purple-600' },
];

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${isCollapsed ? 'w-20' : 'w-64'} shadow-sm`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">LAD</h1>
          </div>
        )}
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
          {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>
      <nav className="mt-2 flex-1 px-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.name}>
              <Link
                to={item.path}
                className={`flex items-center px-3 py-3 rounded-lg transition-all duration-200 font-medium ${
                  location.pathname === item.path
                    ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
              <item.icon className={`h-5 w-5 ${item.color}`} />
                {!isCollapsed && <span className="ml-3">{item.name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
