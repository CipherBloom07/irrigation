import React from 'react';
import { BrainCircuit, ArrowUpRight, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { buildIrrigationInsights } from '../services/intelligence';

const priorityStyle = {
  High: 'bg-rose-100 text-rose-700',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-emerald-100 text-emerald-700',
};

export default function IntelligencePanel({ schemes, telemetry, onViewAll, compact = false }) {
  const insights = buildIrrigationInsights(schemes, telemetry);
  const visible = compact ? insights.slice(0, 3) : insights;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><BrainCircuit className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Decision support</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Irrigation intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Priorities calculated from scheme performance and available telemetry.</p>
          </div>
        </div>
        {compact && <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-900">View all <ArrowUpRight className="h-4 w-4" /></button>}
      </div>

      <div className="mt-5 space-y-3">
        {visible.map((item) => {
          const Icon = item.priority === 'High' ? AlertTriangle : item.priority === 'Low' ? CheckCircle2 : Info;
          return (
            <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={`h-4 w-4 ${item.priority === 'High' ? 'text-rose-600' : 'text-slate-500'}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.category}</span>
                <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyle[item.priority]}`}>{item.priority} priority</span>
              </div>
              <h4 className="mt-2 font-semibold text-slate-900">{item.title}</h4>
              <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
              <p className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm text-slate-700"><span className="font-semibold">Suggested next step:</span> {item.action}</p>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">Recommendations are rule-based decision support, not field measurements. Confirm conditions with local teams before changing water allocations.</p>
    </section>
  );
}
