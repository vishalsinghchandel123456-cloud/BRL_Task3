// src/components/AuthScreen.jsx
// Register / Login form. One toggle between the two modes.
// On success the API returns { token, user }; we store them in
// sessionStorage (per tab) and hand the user up to <App />.

import { useState } from 'react';
import { api, storeSession } from '../api.js';

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login';
      const body =
        mode === 'register' ? { name, email, password } : { email, password };
      const data = await api(path, { method: 'POST', body, auth: false });
      storeSession(data.token, data.user);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">💬</div>
        <h1>BRL Chat</h1>
        <p className="auth-sub">
          {mode === 'login' ? 'Welcome back — sign in to continue' : 'Create an account to start chatting'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                minLength={2}
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button type="button" className="link" onClick={() => switchMode('register')}>
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button type="button" className="link" onClick={() => switchMode('login')}>
                Login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
