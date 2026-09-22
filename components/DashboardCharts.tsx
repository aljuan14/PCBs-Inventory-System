'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface ChartProps {
  distributionData: {
    category: string;
    transformator: number;
    kapasitor: number;
    minyak: number;
  }[];
  riskCategoryData: {
    name: string;
    value: number;
    color: string;
  }[];
}

export default function DashboardCharts({ distributionData, riskCategoryData }: ChartProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 1. Bar Chart: Distribusi Konsentrasi PCBs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Distribusi Kategori Bahaya PCBs per Jenis Alat
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Perbandingan tingkat kontaminasi sesuai standar Konvensi Stockholm
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} stroke="#64748b" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="transformator" name="Transformator" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="kapasitor" name="Kapasitor" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="minyak" name="Minyak Dielektrik" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Pie Chart: Proporsi Klasifikasi Risiko */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Proporsi Status Risiko PCBs Keseluruhan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Komposisi sampel bebas PCBs vs terkontaminasi vs bahaya tinggi
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={riskCategoryData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }: any) =>
                  percent > 0 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={false}
              >
                {riskCategoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
