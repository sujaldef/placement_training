'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

async function callAuthApi(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data;
}

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const title = useMemo(() => {
    return mode === 'login' ? 'Welcome Back' : 'Create Your Account';
  }, [mode]);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint =
        mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      await callAuthApi(endpoint, { name, password });
      router.push('/dashboard');
      router.refresh();
    } catch (submitError) {
      setError(submitError.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Placement Training 2025</p>
        <h1>{title}</h1>
        <p className="muted">
          Sign up or log in to save your day-by-day prep status and continue
          from any device.
        </p>

        <div className="mode-switch">
          <button
            className={mode === 'login' ? 'active' : ''}
            type="button"
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            type="button"
            onClick={() => setMode('signup')}
          >
            Signup
          </button>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Login'
                : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}
