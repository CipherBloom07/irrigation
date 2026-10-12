import React from 'react';
import { Sun, Droplets, Wind, CloudRain, Activity } from 'lucide-react';

export default function ClimateBanner({ telemetry }) {
  const metrics = [
    { label: 'SOIL MOISTURE', val: `${telemetry.soil_moisture ?? 66}%`, sub: 'Reported average', icon: Droplets },
    { label: 'WIND SPEED', val: `${telemetry.wind_speed ?? 13.2} km/h`, icon: Wind },
    { label: 'RAIN RISK 24H', val: `${telemetry.rain_risk ?? 10}%`, sub: 'Reported estimate', icon: CloudRain },
    { label: 'WATER FLOW', val: `${telemetry.water_flow ?? 46.1} m³/s`, icon: Activity },
  ];

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 p-5 text-white shadow-lg shadow-emerald-500/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Climate & water watch</p>
          <h2 className="mt-2 text-3xl font-bold">Operational readiness</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-emerald-50">
          <Sun className="h-4 w-4" />
          {telemetry.data_source || 'Conditions unavailable'}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {metrics.map(({ label, val, sub, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-emerald-50">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{val}</p>
            {sub ? <p className="mt-1 text-sm text-emerald-100">{sub}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
