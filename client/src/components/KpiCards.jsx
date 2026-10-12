import React from 'react';
import { Sprout, Droplets, User, CheckCircle2, TrendingUp } from 'lucide-react';

export default function KpiCards({ schemes }) {
  const totalEquipped = schemes.reduce((acc, scheme) => acc + (scheme.equipped_area || 0), 0);
  const functionalArea = schemes.reduce((acc, scheme) => acc + (scheme.functional_area || 0), 0);
  const totalBeneficiaries = schemes.reduce((acc, scheme) => acc + (scheme.beneficiaries || 0), 0);
  const functionalCount = schemes.filter((scheme) => scheme.status === 'Functional').length;
  const functionalRate = schemes.length ? ((functionalCount / schemes.length) * 100).toFixed(1) : 0;

  const cards = [
    { title: 'Total Equipped Area', value: `${totalEquipped.toLocaleString()} ha`, icon: Droplets, accent: 'text-cyan-600 bg-cyan-100' },
    { title: 'Functional Area', value: `${functionalArea.toLocaleString()} ha`, icon: Sprout, accent: 'text-emerald-600 bg-emerald-100' },
    { title: 'Beneficiaries', value: totalBeneficiaries.toLocaleString(), icon: User, accent: 'text-violet-600 bg-violet-100' },
    { title: 'Functional Schemes', value: `${functionalCount}/${schemes.length || 0}`, icon: CheckCircle2, accent: 'text-green-600 bg-green-100' },
    { title: 'Functional Rate', value: `${functionalRate}%`, icon: TrendingUp, accent: 'text-amber-600 bg-amber-100' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ title, value, icon: Icon, accent }) => (
        <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">KPI</span>
          </div>
          <p className="mt-4 text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}