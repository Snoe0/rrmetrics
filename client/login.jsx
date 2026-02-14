const helper = require('./helper.js');
const React = require('react');
const { useState, useEffect, useRef } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');

const handleLogin = (e) => {
  e.preventDefault();
  helper.hideError();

  const username = e.target.querySelector('#user').value;
  const pass = e.target.querySelector('#pass').value;

  if (!username || !pass) {
    helper.handleError('Username or password is empty');
    return false;
  }

  helper.sendPost(e.target.action, { username, pass });
  return false;
};

const handleSignup = (e) => {
  e.preventDefault();
  helper.hideError();

  const username = e.target.querySelector('#user').value;
  const pass = e.target.querySelector('#pass').value;
  const pass2 = e.target.querySelector('#pass2').value;

  if (!username || !pass || !pass2) {
    helper.handleError('All fields are required');
    return false;
  }

  if (pass !== pass2) {
    helper.handleError('Passwords do not match');
    return false;
  }

  helper.sendPost(e.target.action, { username, pass, pass2 });
  return false;
};

const GoogleSignInButton = () => {
  const [error, setError] = useState(null);
  const [gsiReady, setGsiReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clientId = window.__GOOGLE_CLIENT_ID__;
    if (!clientId) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setError(null);
          setLoading(true);
          try {
            const res = await fetch('/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await res.json();
            if (data.redirect) {
              window.location.href = data.redirect;
            } else if (data.error) {
              setError(data.error);
              setLoading(false);
            }
          } catch (err) {
            setError('Google sign-in failed. Please try again.');
            setLoading(false);
          }
        },
      });
      setGsiReady(true);
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initGoogle();
        }
      }, 100);
      const timeout = setTimeout(() => clearInterval(interval), 5000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, []);

  const handleClick = () => {
    if (loading) return;
    const clientId = window.__GOOGLE_CLIENT_ID__;
    if (!clientId) {
      setError('Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in your environment.');
      return;
    }
    if (gsiReady && window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setError('Google popup was blocked or dismissed. Please allow popups and try again.');
        }
      });
    } else {
      setError('Google Sign-In is still loading. Please try again in a moment.');
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-3 p-2 bg-negative/10 border border-negative/30 rounded-lg text-negative text-xs text-center">{error}</div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 bg-bg-input border border-border rounded-lg text-text-primary text-sm font-medium hover:bg-bg-surface hover:border-text-muted transition-colors disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {loading ? 'Signing in...' : 'Continue with Google'}
      </button>
    </div>
  );
};

const OrDivider = () => (
  <div className="flex items-center gap-3 my-6">
    <div className="flex-1 h-px bg-border"></div>
    <span className="text-text-muted text-xs font-medium">OR</span>
    <div className="flex-1 h-px bg-border"></div>
  </div>
);

const LoginWindow = ({ onSwitchToSignup }) => {
  return (
    <form
      id="loginForm"
      name="loginForm"
      onSubmit={handleLogin}
      action="/login"
      method="POST"
      className="w-full"
    >
      <h2 className="text-2xl font-bold text-text-primary mb-1">Welcome back</h2>
      <p className="text-text-secondary text-sm mb-8">Enter your credentials to access your account</p>

      <GoogleSignInButton />
      <OrDivider />

      <div className="space-y-5">
        <div>
          <label htmlFor="user" className="block text-sm font-medium text-text-secondary mb-2">Username</label>
          <input
            id="user"
            type="text"
            name="username"
            placeholder="Enter your username"
            autoComplete="username"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>

        <div>
          <label htmlFor="pass" className="block text-sm font-medium text-text-secondary mb-2">Password</label>
          <input
            id="pass"
            type="password"
            name="pass"
            placeholder="Enter your password"
            autoComplete="current-password"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all"
      >
        Sign In
      </button>

      <p className="text-center text-text-secondary text-sm mt-6">
        Don't have an account?{' '}
        <button type="button" className="text-accent hover:underline font-medium" onClick={onSwitchToSignup}>
          Sign Up
        </button>
      </p>
    </form>
  );
};

const SignupWindow = ({ onSwitchToLogin }) => {
  return (
    <form
      id="signupForm"
      name="signupForm"
      onSubmit={handleSignup}
      action="/signup"
      method="POST"
      className="w-full"
    >
      <h2 className="text-2xl font-bold text-text-primary mb-1">Create Account</h2>
      <p className="text-text-secondary text-sm mb-8">Start your trading journey with RR Metrics</p>

      <GoogleSignInButton />
      <OrDivider />

      <div className="space-y-5">
        <div>
          <label htmlFor="user" className="block text-sm font-medium text-text-secondary mb-2">Username</label>
          <input
            id="user"
            type="text"
            name="username"
            placeholder="Choose a username"
            autoComplete="username"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>

        <div>
          <label htmlFor="pass" className="block text-sm font-medium text-text-secondary mb-2">Password</label>
          <input
            id="pass"
            type="password"
            name="pass"
            placeholder="Create a password"
            autoComplete="new-password"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>

        <div>
          <label htmlFor="pass2" className="block text-sm font-medium text-text-secondary mb-2">Confirm Password</label>
          <input
            id="pass2"
            type="password"
            name="pass2"
            placeholder="Confirm your password"
            autoComplete="new-password"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all"
      >
        Create Account
      </button>

      <p className="text-center text-text-secondary text-sm mt-6">
        Already have an account?{' '}
        <button type="button" className="text-accent hover:underline font-medium" onClick={onSwitchToLogin}>
          Sign In
        </button>
      </p>
    </form>
  );
};

const App = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="min-h-screen flex">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-bg-surface flex-col justify-between p-12 border-r border-border">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
            <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
          </div>

          <h1 className="text-4xl font-bold text-text-primary leading-tight mb-4">
            Master Your<br />Trading Journey
          </h1>
          <p className="text-text-secondary text-lg max-w-md">
            Track, analyze, and improve your trades with powerful analytics and seamless broker integration.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="bg-bg-input rounded-xl p-4 border border-border">
            <div className="text-accent font-mono text-2xl font-bold">12K+</div>
            <div className="text-text-secondary text-sm mt-1">Trades Tracked</div>
          </div>
          <div className="bg-bg-input rounded-xl p-4 border border-border">
            <div className="text-accent font-mono text-2xl font-bold">94%</div>
            <div className="text-text-secondary text-sm mt-1">User Satisfaction</div>
          </div>
          <div className="bg-bg-input rounded-xl p-4 border border-border">
            <div className="text-accent font-mono text-2xl font-bold">50+</div>
            <div className="text-text-secondary text-sm mt-1">Broker Integrations</div>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
            <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
          </div>

          <div id="errorDiv" className="hidden mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
            <span id="errorMessage" className="text-negative text-sm"></span>
          </div>

          {isLogin ? (
            <LoginWindow onSwitchToSignup={() => setIsLogin(false)} />
          ) : (
            <SignupWindow onSwitchToLogin={() => setIsLogin(true)} />
          )}
        </div>
      </div>
    </div>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
