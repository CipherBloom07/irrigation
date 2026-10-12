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

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setBusy(true);
    try {
      const result = setupRequired
        ? await setupAdmin({ bootstrapToken: bootstrapToken.trim() || undefined, email, password })
        : await loginAdmin({ email, password });
      onAuthenticated(result.admin);
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'Administrator authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="portal-admin-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="portal-admin-modal" role="dialog" aria-modal="true" aria-labelledby="portal-admin-heading">
        <div className="portal-admin-modal-head">
          <span><ShieldCheck size={19} /></span>
          <button type="button" aria-label="Close administrator dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <p className="portal-admin-eyebrow">{setupRequired ? 'INITIAL ADMINISTRATOR ONBOARDING' : 'ADMINISTRATOR AUTHENTICATION'}</p>
        <h2 id="portal-admin-heading">{setupRequired ? 'Create Administrator Account' : 'Administrator Sign In'}</h2>
        <p className="portal-admin-intro">
          {setupRequired
            ? 'Set up your primary administrator credentials to enable scheme creation, updates, and deletion across the national registry.'
            : 'Sign in to manage irrigation schemes, field records, and telemetry configurations.'}
        </p>

        <form onSubmit={submit} className="portal-admin-form">
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="admin@agritech.gov.zw"
              maxLength={254}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={setupRequired ? 'new-password' : 'current-password'}
              placeholder="••••••••••••"
              minLength={8}
              maxLength={128}
              required
            />
          </label>

          {setupRequired && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="••••••••••••"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
          )}

          {setupRequired && (
            <p className="portal-admin-hint">
              <KeyRound size={14} /> Passwords are securely hashed with scrypt & unique salts. Once created, setup locks permanently.
            </p>
          )}

          {error && <p className="portal-admin-error" role="alert">{error}</p>}

          <div className="portal-admin-actions">
            <button type="button" className="portal-admin-cancel" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="portal-admin-submit" disabled={busy}>
              {busy ? 'Verifying…' : setupRequired ? 'Create Admin & Sign In' : 'Sign In'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
