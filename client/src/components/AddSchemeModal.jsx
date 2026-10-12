import React, { useEffect, useState } from 'react';

const initialForm = {
  name: '',
  district: '',
  province: '',
  source: 'Dam',
  ward: '',
  equipped_area: '',
  functional_area: '',
  beneficiaries: '',
  crop: '',
  market: '',
  market_analysis: '',
  officer: '',
  officer_phone: '',
  rehab: '',
  asset_scores: null,
  risk_factors: [],
  status: 'Fully Functional',
};

export default function AddSchemeModal({ open, onClose, onSubmit, scheme = null }) {
  const [form, setForm] = useState(initialForm);
  const [validationError, setValidationError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(scheme ? Object.fromEntries(Object.keys(initialForm).map((key) => [
        key,
        key === 'asset_scores'
          ? scheme.asset_scores ?? null
          : key === 'risk_factors'
            ? Array.isArray(scheme.risk_factors) ? scheme.risk_factors : []
            : scheme[key] ?? '',
      ])) : initialForm);
      setValidationError('');
      setBusy(false);
    } else {
      setForm(initialForm);
      setValidationError('');
    }
  }, [open, scheme]);

  if (!open) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const equippedArea = Number(form.equipped_area);
    const functionalArea = Number(form.functional_area);
    const beneficiaryCount = Number(form.beneficiaries);
    if (!form.name.trim() || !form.province.trim() || !form.district.trim()) {
      setValidationError('Scheme name, province, and district are required.');
      return;
    }
    if (!Number.isFinite(equippedArea) || equippedArea <= 0 || !Number.isFinite(functionalArea) || functionalArea < 0 || functionalArea > equippedArea) {
      setValidationError('Enter valid area values; functional area cannot exceed equipped area.');
      return;
    }
    if (!Number.isInteger(beneficiaryCount) || beneficiaryCount < 0) {
      setValidationError('Beneficiaries must be a non-negative whole number.');
      return;
    }
    if (form.officer_phone && !/^[+()\d\s.-]{7,25}$/.test(form.officer_phone)) {
      setValidationError('Enter a valid officer phone number.');
      return;
    }
    setValidationError('');
    setBusy(true);
    Promise.resolve(onSubmit({
      ...form,
      ward: form.ward ? Number(form.ward) : null,
      equipped_area: equippedArea,
      functional_area: functionalArea,
      beneficiaries: beneficiaryCount,
    })).catch((error) => {
      setValidationError(error.message || 'Unable to save the scheme.');
    }).finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm md:items-center">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{scheme ? 'Registry update' : 'New record'}</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">{scheme ? 'Edit irrigation scheme' : 'Add irrigation scheme'}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full bg-slate-100 px-2 py-1 text-lg text-slate-600">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 block text-sm font-medium text-slate-700">
            Scheme name
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            District
            <input
              name="district"
              value={form.district}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Province
            <input
              name="province"
              value={form.province}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Status
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            >
              <option>Fully Functional</option>
              <option>Partially Functional</option>
              <option>Under Rehabilitation</option>
              <option>Non-Functional</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Ward
            <input type="number" name="ward" min="1" step="1" value={form.ward} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Water source
            <select
              name="source"
              value={form.source}
              onChange={handleChange}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            >
              <option>Dam</option>
              <option>River</option>
              <option>Borehole</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Equipped area (ha)
            <input
              type="number"
              name="equipped_area"
              min="0.1"
              step="0.1"
              value={form.equipped_area}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Functional area (ha)
            <input
              type="number"
              name="functional_area"
              min="0"
              step="0.1"
              value={form.functional_area}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="md:col-span-2 block text-sm font-medium text-slate-700">
            Beneficiaries
            <input
              type="number"
              name="beneficiaries"
              min="0"
              step="1"
              value={form.beneficiaries}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Crops cultivated
            <input name="crop" value={form.crop} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Market outlet
            <input name="market" value={form.market} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Market strategy
            <select name="market_analysis" value={form.market_analysis} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white">
              <option value="">Not provided</option>
              <option>High demand</option>
              <option>Moderate</option>
              <option>Incomplete</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Field officer
            <input name="officer" value={form.officer} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Officer phone
            <input type="tel" name="officer_phone" value={form.officer_phone} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-emerald-400 focus:bg-white" />
          </label>

          {validationError && <p className="md:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700" role="alert">{validationError}</p>}

          <div className="md:col-span-2 mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-600">
              {busy ? 'Saving…' : scheme ? 'Update scheme' : 'Save scheme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
