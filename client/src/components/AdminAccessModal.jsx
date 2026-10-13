import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X, ArrowLeft } from 'lucide-react';
import {
  loginAdmin,
  setupAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
} from '../services/api';

export default function AdminAccessModal({ open, setupRequired, onClose, onAuthenticated }) {
  const resetToken = new URLSearchParams(window.location.search).get('adminReset') || '';
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const actualMode = setupRequired ? 'setup' : mode;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if ((actualMode === 'setup' || actualMode === 'reset') && password !== confirmPassword) {
      setError('The password confirmation does not match.');
      return;
    }
    if ((actualMode === 'setup' || actualMode === 'reset') && password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setBusy(true);
    try {
      if (actualMode === 'forgot') {
        const result = await requestAdminPasswordReset(email.trim());
        setMessage(result.message || 'If an administrator account exists for that email, instructions will be sent shortly.');
      } else if (actualMode === 'reset') {
        const result = await resetAdminPassword(resetToken, password);
        setMessage(result.message || 'Password updated. Sign in with your new password.');
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const result = actualMode === 'setup'
          ? await setupAdmin({ bootstrapToken: bootstrapToken.trim() || undefined, email, password })
          : await loginAdmin({ email, password });
        onAuthenticated(result.admin);
        onClose();
      }
    } catch (requestError) {
      setError(requestError.message || 'Administrator authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const title = actualMode === 'setup' ? 'Create Administrator Account'
    : actualMode === 'forgot' ? 'Forgot your password?'
      : actualMode === 'reset' ? 'Choose a new password'
        : 'Administrator Sign In';

  return (
    <div className="portal-admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="portal-admin-modal" role="dialog" aria-modal="true" aria-labelledby="portal-admin-heading">
        <div className="portal-admin-modal-head">
          <span><ShieldCheck size={19} /></span>
          <button type="button" aria-label="Close administrator dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <p className="portal-admin-eyebrow">{actualMode === 'setup' ? 'INITIAL ADMINISTRATOR ONBOARDING' : 'SECURE ADMINISTRATOR ACCESS'}</p>
        <h2 id="portal-admin-heading">{title}</h2>
        <p className="portal-admin-intro">
          {actualMode === 'setup'
            ? 'Create the primary administrator account to manage the scheme registry.'
            : actualMode === 'forgot'
              ? 'Enter the email address linked to your administrator account. If it exists, we will send a one-time reset link.'
              : actualMode === 'reset'
                ? 'Choose a new password. This one-time reset link expires after 30 minutes.'
                : 'Sign in to manage irrigation schemes, field records, and telemetry configurations.'}
        </p>

        <form onSubmit={submit} className="portal-admin-form">
          {(actualMode !== 'reset') && <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="username" placeholder="admin@example.com" maxLength={254} required />
          </label>}

          {(actualMode === 'login' || actualMode === 'setup' || actualMode === 'reset') && <label>
            {actualMode === 'reset' ? 'New password' : 'Password'}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
              autoComplete={actualMode === 'login' ? 'current-password' : 'new-password'}
              placeholder="At least 8 characters" minLength={8} maxLength={128} required />
          </label>}

          {(actualMode === 'setup' || actualMode === 'reset') && <label>
            Confirm password
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password" placeholder="Re-enter password" minLength={8} maxLength={128} required />
          </label>}

          {actualMode === 'setup' && <label>
            Bootstrap token (if configured)
            <input type="password" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)}
              autoComplete="off" placeholder="Optional setup authorization token" />
          </label>}

          {actualMode === 'setup' && <p className="portal-admin-hint">
            <KeyRound size={14} /> Passwords are scrypt-hashed. Initial setup locks after the first administrator is created.
          </p>}

          {error && <p className="portal-admin-error" role="alert">{error}</p>}
          {message && <p className="portal-admin-success" role="status">{message}</p>}

          <div className="portal-admin-actions">
            <button type="button" className="portal-admin-cancel" onClick={onClose} disabled={busy}>Close</button>
            <button type="submit" className="portal-admin-submit" disabled={busy}>
              {busy ? 'Please wait…' : actualMode === 'setup' ? 'Create Admin & Sign In'
                : actualMode === 'forgot' ? 'Send Reset Link'
                  : actualMode === 'reset' ? 'Update Password' : 'Sign In'}
            </button>
          </div>
        </form>
        {!setupRequired && actualMode === 'login' && <button type="button" className="portal-admin-text-link"
          onClick={() => { setMode('forgot'); setError(''); setMessage(''); }} disabled={busy}>Forgot password?</button>}
        {!setupRequired && (actualMode === 'forgot' || actualMode === 'reset') && <button type="button" className="portal-admin-text-link"
          onClick={() => { setMode('login'); setError(''); setMessage(''); }} disabled={busy}><ArrowLeft size={13} /> Back to sign in</button>}
      </section>
    </div>
  );
}
