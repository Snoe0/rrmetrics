const helper = require('./helper.js');
const React = require('react');
const { useState } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');

const handleLogin = (e) => {
  e.preventDefault();
  helper.hideError();

  const email = e.target.querySelector('#email').value;
  const pass = e.target.querySelector('#pass').value;

  if (!email || !pass) {
    helper.handleError('Email or password is empty');
    return false;
  }

  helper.sendPost(e.target.action, { email, pass });
  return false;
};

const handleSignup = (e) => {
  e.preventDefault();
  helper.hideError();

  const email = e.target.querySelector('#email').value;
  const pass = e.target.querySelector('#pass').value;
  const pass2 = e.target.querySelector('#pass2').value;

  if (!email || !pass || !pass2) {
    helper.handleError('All fields are required');
    return false;
  }

  if (pass !== pass2) {
    helper.handleError('Passwords do not match');
    return false;
  }

  helper.sendPost(e.target.action, { email, pass, pass2 });
  return false;
};

const LoginWindow = ({ onSwitchToSignup, onSwitchToForgot }) => {
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

      <div className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="pass" className="block text-sm font-medium text-text-secondary">Password</label>
            <button type="button" className="text-accent text-xs hover:underline" onClick={onSwitchToForgot}>
              Forgot password?
            </button>
          </div>
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

      <div className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
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

const ForgotPasswordWindow = ({ onSwitchToLogin }) => {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = e.target.querySelector('#forgotEmail').value.trim();
    if (!email) {
      setError('Please enter your email.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="w-full text-center">
        <div className="w-14 h-14 bg-positive/20 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-positive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Check Your Email</h2>
        <p className="text-text-secondary text-sm mb-8">
          If an account with that email exists, we've sent a password reset link.
        </p>
        <button
          type="button"
          className="text-accent hover:underline text-sm font-medium"
          onClick={onSwitchToLogin}
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <h2 className="text-2xl font-bold text-text-primary mb-1">Forgot Password</h2>
      <p className="text-text-secondary text-sm mb-8">Enter your email and we'll send a reset link.</p>

      {error && (
        <div className="mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
          <span className="text-negative text-sm">{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="forgotEmail" className="block text-sm font-medium text-text-secondary mb-2">Email</label>
        <input
          id="forgotEmail"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send Reset Link'}
      </button>

      <p className="text-center text-text-secondary text-sm mt-6">
        Remember your password?{' '}
        <button type="button" className="text-accent hover:underline font-medium" onClick={onSwitchToLogin}>
          Sign In
        </button>
      </p>
    </form>
  );
};

const App = () => {
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('signup')) return 'signup';
    if (params.has('reset')) return 'reset';
    return 'login';
  });

  const renderView = () => {
    switch (view) {
      case 'signup':
        return <SignupWindow onSwitchToLogin={() => setView('login')} />;
      case 'forgot':
        return <ForgotPasswordWindow onSwitchToLogin={() => setView('login')} />;
      case 'reset':
        return <ResetPasswordWindow onSwitchToLogin={() => setView('login')} />;
      default:
        return (
          <LoginWindow
            onSwitchToSignup={() => setView('signup')}
            onSwitchToForgot={() => setView('forgot')}
          />
        );
    }
  };

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
            <div className="text-accent font-mono text-2xl font-bold">99%</div>
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

          {renderView()}
        </div>
      </div>
    </div>
  );
};

const ResetPasswordWindow = ({ onSwitchToLogin }) => {
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const pass = e.target.querySelector('#newPass').value;
    const pass2 = e.target.querySelector('#newPass2').value;

    if (!pass || !pass2) {
      setError('All fields are required.');
      setLoading(false);
      return;
    }
    if (pass !== pass2) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');

    try {
      const res = await fetch('/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pass, pass2 }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="w-full text-center">
        <div className="w-14 h-14 bg-positive/20 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-positive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Password Reset</h2>
        <p className="text-text-secondary text-sm mb-8">Your password has been updated successfully.</p>
        <button
          type="button"
          className="bg-accent text-accent-text font-semibold px-8 py-3 rounded-lg hover:brightness-110 transition-all"
          onClick={onSwitchToLogin}
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <h2 className="text-2xl font-bold text-text-primary mb-1">Reset Password</h2>
      <p className="text-text-secondary text-sm mb-8">Enter your new password below.</p>

      {error && (
        <div className="mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
          <span className="text-negative text-sm">{error}</span>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="newPass" className="block text-sm font-medium text-text-secondary mb-2">New Password</label>
          <input
            id="newPass"
            type="password"
            placeholder="Enter new password"
            autoComplete="new-password"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>
        <div>
          <label htmlFor="newPass2" className="block text-sm font-medium text-text-secondary mb-2">Confirm New Password</label>
          <input
            id="newPass2"
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
      >
        {loading ? 'Resetting...' : 'Reset Password'}
      </button>

      <p className="text-center text-text-secondary text-sm mt-6">
        <button type="button" className="text-accent hover:underline font-medium" onClick={onSwitchToLogin}>
          Back to Sign In
        </button>
      </p>
    </form>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
