'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- Session Check Logic ---
  useEffect(() => {
    let mounted = true;
    async function resumeSession() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.ok && mounted) {
          router.replace('/dashboard');
          router.refresh();
          return;
        }
      } catch (_error) {
        // Ignore network errors
      } finally {
        if (mounted) setCheckingSession(false);
      }
    }
    resumeSession();
    return () => { mounted = false; };
  }, [router]);

  const title = useMemo(() => {
    return mode === 'login' ? 'Welcome Back' : 'Create Account';
  }, [mode]);

  // --- Auth Logic ---
  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = data?.error || 'Request failed';
        
        // AUTO-SIGNUP LOGIC: Switch modes if account doesn't exist
        if (mode === 'login' && (msg.toLowerCase().includes('not found') || response.status === 404)) {
          setError("Account doesn't exist. Switching to Signup...");
          setTimeout(() => {
            setMode('signup');
            setError('');
          }, 1500);
          return;
        }
        throw new Error(msg);
      }

      router.push('/dashboard');
      router.refresh();
    } catch (submitError) {
      setError(submitError.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="split-layout">
      <style jsx>{`
        .split-layout {
          --primary: #6366f1;
          --primary-glow: rgba(99, 102, 241, 0.4);
          --bg-dark: #030712;
          --bg-panel: #0a0f1c;
          --border: rgba(255, 255, 255, 0.08);
          
          display: flex;
          min-height: 100vh;
          font-family: 'Inter', -apple-system, sans-serif;
          color: white;
          background: var(--bg-dark);
          overflow: hidden;
        }

        /* --- LEFT PANEL (FORM) --- */
        .left-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--bg-panel);
          border-right: 1px solid var(--border);
          padding: 40px 20px;
          z-index: 10;
          position: relative;
        }

        .auth-container {
          width: 100%;
          max-width: 380px;
        }

        .header { text-align: left; margin-bottom: 32px; }
        .eyebrow { 
          font-size: 0.75rem; 
          font-weight: 700; 
          color: var(--primary); 
          text-transform: uppercase; 
          letter-spacing: 0.15em;
          margin-bottom: 8px;
        }
        h1 { font-size: 2.2rem; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
        .muted { color: #9ca3af; font-size: 0.95rem; margin-top: 12px; line-height: 1.5; }

        /* Mode Switcher */
        .mode-switch {
          display: flex;
          background: rgba(0, 0, 0, 0.4);
          padding: 6px;
          border-radius: 16px;
          margin-bottom: 32px;
          position: relative;
          border: 1px solid var(--border);
        }
        .mode-switch button {
          flex: 1;
          background: none;
          border: none;
          color: #9ca3af;
          padding: 12px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          z-index: 1;
          transition: color 0.3s;
        }
        .mode-switch button.active { color: white; }
        .slider {
          position: absolute;
          height: calc(100% - 12px);
          width: calc(50% - 6px);
          background: var(--primary);
          border-radius: 12px;
          top: 6px;
          left: 6px;
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .slider.signup { transform: translateX(100%); }

        /* Form Controls */
        .auth-form { display: flex; flex-direction: column; gap: 20px; }
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        label { font-size: 0.85rem; font-weight: 500; color: #d1d5db; margin-left: 4px; }
        input {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          color: white;
          font-size: 1rem;
          transition: all 0.2s;
        }
        input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
          background: rgba(0, 0, 0, 0.5);
        }

        .error-text {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          font-size: 0.85rem;
          padding: 12px;
          border-radius: 10px;
          text-align: center;
        }

        .submit-btn {
          background: var(--primary);
          color: white;
          border: none;
          padding: 16px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 12px;
          box-shadow: 0 4px 15px var(--primary-glow);
        }
        .submit-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px var(--primary-glow);
        }
        .submit-btn:disabled { opacity: 0.7; cursor: wait; transform: none; }

        /* Loader */
        .loader-spin {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* --- RIGHT PANEL (AESTHETICS & ANIMATIONS) --- */
        .right-panel {
          display: none; /* Hidden on mobile */
          position: relative;
          background: var(--bg-dark);
          overflow: hidden;
        }

        /* Animated Grid Background */
        .grid-bg {
          position: absolute;
          inset: -50%; /* Make it larger so it can pan endlessly */
          background-size: 50px 50px;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          animation: panGrid 30s linear infinite;
          mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
        }

        @keyframes panGrid {
          0% { transform: translateY(0) translateX(0); }
          100% { transform: translateY(50px) translateX(50px); }
        }

        /* Glowing Orbs */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          z-index: 1;
          animation: floatOrb 15s infinite alternate ease-in-out;
        }
        .orb-1 { 
          width: 400px; height: 400px; 
          background: rgba(99, 102, 241, 0.2); 
          top: 10%; left: 20%; 
        }
        .orb-2 { 
          width: 500px; height: 500px; 
          background: rgba(168, 85, 247, 0.15); /* Purple accent */
          bottom: 10%; right: 10%; 
          animation-delay: -5s; 
        }

        @keyframes floatOrb {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -50px) scale(1.1); }
          100% { transform: translate(-40px, 20px) scale(0.9); }
        }

        /* Floating Glass Cards */
        .glass-cards-container {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 24px;
          perspective: 1000px;
        }

        .glass-card {
          background: rgba(17, 24, 39, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 20px 32px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 1.1rem;
          font-weight: 600;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          animation: floatCard 6s infinite ease-in-out;
        }

        .card-1 { animation-delay: 0s; transform: translateX(-40px); }
        .card-2 { animation-delay: -2s; transform: translateX(40px); }
        .card-3 { animation-delay: -4s; transform: translateX(-20px); }

        .icon-box {
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          font-size: 1.2rem;
        }

        @keyframes floatCard {
          0% { transform: translateY(0px) translateX(var(--tx)); }
          50% { transform: translateY(-15px) translateX(var(--tx)); }
          100% { transform: translateY(0px) translateX(var(--tx)); }
        }

        /* Responsive Breakpoints */
        @media (min-width: 1024px) {
          .left-panel { flex: 0 0 33.333%; min-width: 450px; }
          .right-panel { flex: 1; display: flex; align-items: center; justify-content: center; }
          .card-1 { --tx: -40px; }
          .card-2 { --tx: 40px; }
          .card-3 { --tx: -20px; }
        }
      `}</style>

      {/* --- LEFT PANEL --- */}
      <div className="left-panel">
        <div className="auth-container">
          {checkingSession ? (
            <div className="header" style={{ padding: '40px 0', textAlign: 'center' }}>
              <div className="loader-spin" style={{ marginBottom: '16px' }} />
              <p className="muted">Authenticating session...</p>
            </div>
          ) : (
            <>
              <div className="header">
                <p className="eyebrow">Placement Training 2025</p>
                <h1>{title}</h1>
                <p className="muted">
                  Track your daily preparation progress and master your technical interviews.
                </p>
              </div>

              <div className="mode-switch">
                <div className={`slider ${mode === 'signup' ? 'signup' : ''}`} />
                <button
                  className={mode === 'login' ? 'active' : ''}
                  type="button"
                  onClick={() => { setMode('login'); setError(''); }}
                >
                  Login
                </button>
                <button
                  className={mode === 'signup' ? 'active' : ''}
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); }}
                >
                  Signup
                </button>
              </div>

              <form onSubmit={onSubmit} className="auth-form">
                <div className="input-group">
                  <label>Name / Username</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                </div>

                <div className="input-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                  />
                </div>

                {error && <p className="error-text">{error}</p>}

                <button type="submit" disabled={loading} className="submit-btn">
                  {loading ? (
                    <span className="loader-spin" />
                  ) : (
                    mode === 'login' ? 'Sign In to Dashboard' : 'Create Account'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* --- RIGHT PANEL --- */}
      <div className="right-panel">
        {/* Animated Background Elements */}
        <div className="grid-bg" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />

        {/* Floating Presentation Cards */}
        <div className="glass-cards-container">
          <div className="glass-card card-1">
            <div className="icon-box">💻</div>
            <span>Master Data Structures & Algorithms</span>
          </div>
          <div className="glass-card card-2">
            <div className="icon-box">👔</div>
            <span>Ace Mock Interviews</span>
          </div>
          <div className="glass-card card-3">
            <div className="icon-box">🚀</div>
            <span>Crack Top Tech Giants</span>
          </div>
        </div>
      </div>
    </main>
  );
}