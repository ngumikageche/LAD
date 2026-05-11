import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import theme from '../../theme/theme';

const DashboardLayout = () => {
  return (
    <div className={`flex h-screen ${theme.layout.app}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className={`flex-1 overflow-x-hidden overflow-y-auto ${theme.layout.canvas} p-4 sm:p-6 lg:p-8`}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
