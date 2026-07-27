import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import theme from '../../theme/theme';

const DashboardLayout = () => {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div data-dashboard-root className={`flex h-dvh min-w-0 overflow-hidden ${theme.layout.app}`}>
      <Sidebar
        mobileOpen={mobileNavigationOpen}
        onMobileClose={() => setMobileNavigationOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setMobileNavigationOpen(true)} />
        <main
          data-dashboard-main
          className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto ${theme.layout.canvas} p-3 sm:p-4 lg:p-6 xl:p-8`}
        >
          <div className="mx-auto w-full min-w-0 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
