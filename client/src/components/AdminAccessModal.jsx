import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import {
  loginAdmin,
  setupAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
} from '../services/api';

function PasswordInput({ label, value, onChange, autoComplete, placeholder, required = true, minLength, maxLength = 128 }) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="portal-admin-password-wrap" style={{ position: 'relative', display: 'block' }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          style={{ paddingRight: '46px', width: '100%', boxSizing: 'border-box' }}
        />
        <button
          type="button"
          className="portal-admin-password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          style={{
            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 0, background: 'transparent', cursor: 'pointer', padding: '6px',
            color: 'inherit',
          }}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

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

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const normalizedEmail = email.trim().toLowerCase();
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
        const result = await requestAdminPasswordReset(normalizedEmail);
        setMessage(result.message || 'If an administrator account exists for that email, instructions will be sent shortly.');
      } else if (actualMode === 'reset') {
        if (!resetToken) {
          setError('This password-reset link is missing its token. Request a new reset link.');
          return;
        }
        const result = await resetAdminPassword(resetToken, password);
        setMessage(result.message || 'Password updated. Sign in with your new password.');
        setPassword('');
        setConfirmPassword('');
        const url = new URL(window.location.href);
        url.searchParams.delete('adminReset');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
        changeMode('login');
      } else {
        const result = actualMode === 'setup'
          ? await setupAdmin({ bootstrapToken: bootstrapToken.trim() || undefined, email: normalizedEmail, password })
          : await loginAdmin({ email: normalizedEmail, password });
        if (!result?.admin?.email) {
          throw new Error('The server did not confirm an administrator session. Please try again.');
        }
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
          {actualMode !== 'reset' && <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmail((current) => current.trim().toLowerCase())}
              autoComplete="username" placeholder="admin@example.com" maxLength={254} required />
          </label>}

          {(actualMode === 'login' || actualMode === 'setup' || actualMode === 'reset') && (
            <PasswordInput
              label={actualMode === 'reset' ? 'New password' : 'Password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={actualMode === 'login' ? 'current-password' : 'new-password'}
              placeholder={actualMode === 'login' ? 'Enter your password' : 'At least 8 characters'}
              minLength={actualMode === 'login' ? undefined : 8}
            />
          )}

          {(actualMode === 'setup' || actualMode === 'reset') && (
            <PasswordInput label="Confirm password" value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password" placeholder="Re-enter password" minLength={8} />
          )}

          {actualMode === 'setup' && (
            <PasswordInput label="Bootstrap token (if configured)" value={bootstrapToken}
              onChange={(event) => setBootstrapToken(event.target.value)}
              autoComplete="off" placeholder="Optional setup authorization token" required={false} />
          )}

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
          onClick={() => changeMode('forgot')} disabled={busy}>Forgot password?</button>}
        {!setupRequired && (actualMode === 'forgot' || actualMode === 'reset') && <button type="button" className="portal-admin-text-link"
          onClick={() => changeMode('login')} disabled={busy}><ArrowLeft size={13} /> Back to sign in</button>}
      </section>
    </div>
  );
}
