import { useState, useEffect } from 'react';
import { Printer, AlertCircle, Info } from 'lucide-react';
import { reportsAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface LineItem { description: string; amount: number; paid: number; balance: number; }
interface FeeReport {
  school: { name: string; location: string };
  student: { id: string; name: string; registration_number: string };
  term: { id: string | null; name: string | null };
  line_items: LineItem[];
  summary: { total_charged: number; total_paid: number; balance: number };
  payments: Array<{ date: string; amount: number; reference: string }>;
  note: string | null;
  generated_at: string;
}

export default function FeeStatementPage() {
  const { user } = useAuth();
  const [data, setData] = useState<FeeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId = user?.student_id;

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await reportsAPI.getFeeStatement(studentId) as FeeReport;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fee statement');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
        <AlertCircle size={20} />{error}
      </div>
    </div>
  );

  if (!data) return null;

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      {/* Toolbar */}
      <div className="max-w-3xl mx-auto mb-4 flex gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          <Printer size={18} /> Print / Download PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none" style={{ padding: '16mm' }}>
        {/* Header */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 uppercase">{data.school.name}</h1>
          <p className="text-sm text-gray-600">{data.school.location}</p>
          <h2 className="text-lg font-bold text-gray-800 mt-2 uppercase">Fee Statement</h2>
          {data.term.name && <p className="text-sm text-gray-600">{data.term.name}</p>}
        </div>

        {/* Student Info */}
        <div className="flex gap-8 mb-6 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
          <div><span className="text-gray-500">Name: </span><strong>{data.student.name}</strong></div>
          <div><span className="text-gray-500">Reg No: </span><strong>{data.student.registration_number}</strong></div>
        </div>

        {/* Note banner if no fee module */}
        {data.note && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded flex items-center gap-2 text-blue-700 text-sm">
            <Info size={16} />{data.note}
          </div>
        )}

        {/* Line Items */}
        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Charged</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.line_items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">No fee records available</td>
              </tr>
            ) : data.line_items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2">{item.description}</td>
                <td className="px-3 py-2 text-right">{fmt(item.amount)}</td>
                <td className="px-3 py-2 text-right text-green-700">{fmt(item.paid)}</td>
                <td className={`px-3 py-2 text-right font-medium ${item.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {fmt(item.balance)}
                </td>
              </tr>
            ))}
            {/* Totals row */}
            <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{fmt(data.summary.total_charged)}</td>
              <td className="px-3 py-2 text-right text-green-700">{fmt(data.summary.total_paid)}</td>
              <td className={`px-3 py-2 text-right ${data.summary.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {fmt(data.summary.balance)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Outstanding balance alert */}
        {data.summary.balance > 0 && (
          <div className="mb-6 p-3 bg-red-50 border border-red-300 rounded text-red-700 font-semibold text-sm">
            Outstanding Balance: {fmt(data.summary.balance)} — Please settle at the earliest.
          </div>
        )}

        {/* Payment History */}
        {data.payments.length > 0 && (
          <>
            <h3 className="font-semibold text-gray-800 mb-2 text-sm uppercase">Payment History</h3>
            <table className="w-full text-sm border-collapse mb-6">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-2">{p.date}</td>
                    <td className="px-3 py-2 text-gray-600">{p.reference}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-medium">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className="text-xs text-gray-400 text-right mt-6">
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:shadow-none, .print\\:shadow-none * { visibility: visible; }
          .print\\:shadow-none { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
