import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { loginAdmin, setupAdmin } from '../services/api';

export default function AdminAccessModal({ open, setupRequired, onClose, onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (setupRequired && password !== confirmPassword) {
      setError('The password confirmation does not match.');
      return;
    }
    setBusy(true);
    try {
      const result = setupRequired
        ? await setupAdmin({ bootstrapToken, email, password })
        : await loginAdmin({ email, password });
      onAuthenticated(result.admin);
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'Administrator authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="portal-admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section className="portal-admin-modal" role="dialog" aria-modal="true" aria-labelledby="portal-admin-heading">
      <div className="portal-admin-modal-head">
        <span><ShieldCheck size={19} /></span>
        <button type="button" aria-label="Close administrator dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
      </div>
      <p className="portal-admin-eyebrow">{setupRequired ? 'FIRST-TIME ADMINISTRATOR SETUP' : 'RESTRICTED ACCESS'}</p>
      <h2 id="portal-admin-heading">{setupRequired ? 'Create administrator account' : 'Administrator sign in'}</h2>
      <p className="portal-admin-intro">{setupRequired
        ? 'Use the one-time setup token configured by the system operator. This action is available only until the first administrator is created.'
        : 'Sign in to manage the irrigation scheme registry.'}</p>
      <form onSubmit={submit} className="portal-admin-form">
        {setupRequired && <label>One-time setup token
          <input type="password" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} autoComplete="one-time-code" required />
        </label>}
        <label>Email address
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" maxLength={254} required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={setupRequired ? 'new-password' : 'current-password'} minLength={setupRequired ? 12 : undefined} maxLength={128} required />
        </label>
        {setupRequired && <label>Confirm password
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required />
        </label>}
        {setupRequired && <p className="portal-admin-hint"><KeyRound size={14} /> Use at least 12 characters. The bootstrap token is not stored by the browser.</p>}
        {error && <p className="portal-admin-error" role="alert">{error}</p>}
        <div className="portal-admin-actions">
          <button type="button" className="portal-admin-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-admin-submit" disabled={busy}>{busy ? 'Please wait…' : setupRequired ? 'Create administrator' : 'Sign in'}</button>
        </div>
      </form>
    </section>
  </div>;
}
