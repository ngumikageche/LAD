import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import theme from '../theme/theme';

const ThemeExamplePage = () => {
  return (
    <div className={`min-h-screen ${theme.layout.canvas} p-4 sm:p-6`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className={`${theme.surface.card} p-6`}>
          <h1 className="text-3xl font-bold text-slate-100">Theme Example</h1>
          <p className="mt-2 text-slate-400">
            Blue owns the layout, slate owns the content, and accents are reserved for actions and signals.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button>Primary Action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Healthy KPI" value="84%" icon={<CheckCircle2 className="h-6 w-6" />} colorScheme="emerald" />
          <StatCard title="Monitor KPI" value="47%" icon={<AlertTriangle className="h-6 w-6" />} colorScheme="amber" />
          <StatCard title="Active Stream" value="129" icon={<Activity className="h-6 w-6" />} colorScheme="indigo" />
        </div>

        <section className={`${theme.surface.card} p-6`}>
          <h2 className="text-xl font-semibold text-slate-100">Surface Example</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className={`${theme.surface.subtle} p-4`}>
              <p className="text-sm font-semibold text-slate-200">Neutral Surface</p>
              <p className="mt-2 text-sm text-slate-400">Cards and panels use slate backgrounds for readability.</p>
            </div>
            <div className={`${theme.surface.subtle} p-4`}>
              <p className="text-sm font-semibold text-slate-200">Accent Discipline</p>
              <p className="mt-2 text-sm text-slate-400">Teal, green, red, and amber appear only where action or status matters.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ThemeExamplePage;
