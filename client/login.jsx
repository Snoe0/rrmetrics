const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');
const { supabase } = require('./supabase.js');
require('./styles/globals.css');

const LoginWindow = ({ onSwitchToSignup, onSwitchToForgot }) => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = e.target.querySelector('#email').value.trim();
    const pass = e.target.querySelector('#pass').value;

    if (!email || !pass) {
      setError('Email or password is empty');
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    window.location = '/trades';
  };

  return (
    <form onSubmit={handleLogin} className="w-full">
      <h2 className="text-2xl font-bold text-text-primary mb-1">Welcome back</h2>
      <p className="text-text-secondary text-sm mb-8">Enter your credentials to access your account</p>

      {error && (
        <div className="mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
          <span className="text-negative text-sm">{error}</span>
        </div>
      )}

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
        disabled={loading}
        className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In'}
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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = e.target.querySelector('#email').value.trim();
    const pass = e.target.querySelector('#pass').value;
    const pass2 = e.target.querySelector('#pass2').value;

    if (!email || !pass || !pass2) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (pass !== pass2) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password: pass,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    window.location = '/trades';
  };

  return (
    <form onSubmit={handleSignup} className="w-full">
      <h2 className="text-2xl font-bold text-text-primary mb-1">Create Account</h2>
      <p className="text-text-secondary text-sm mb-8">Start your trading journey with RR Metrics</p>

      {error && (
        <div className="mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
          <span className="text-negative text-sm">{error}</span>
        </div>
      )}

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
        disabled={loading}
        className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Create Account'}
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

const ForgotPasswordWindow = ({ onSwitchToLogin }) => (
  <div className="w-full">
    <h2 className="text-2xl font-bold text-text-primary mb-1">Forgot Password</h2>
    <p className="text-text-secondary text-sm mb-8">
      This is a self-hosted instance, so password resets are done from the server.
    </p>

    <div className="p-4 bg-bg-input border border-border rounded-lg">
      <p className="text-text-secondary text-sm mb-3">
        Run this command in the server terminal to set a new password for your account:
      </p>
      <code className="block font-mono text-sm text-text-primary bg-bg-page border border-border rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap">
        npm run reset-password -- &lt;email&gt; &lt;new-password&gt;
      </code>
      <p className="text-text-muted text-xs mt-3">
        Then sign in with your new password.
      </p>
    </div>

    <p className="text-center text-text-secondary text-sm mt-6">
      Remember your password?{' '}
      <button type="button" className="text-accent hover:underline font-medium" onClick={onSwitchToLogin}>
        Sign In
      </button>
    </p>
  </div>
);

const App = () => {
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('signup')) return 'signup';
    return 'login';
  });
  const [checking, setChecking] = useState(true);

  // Redirect to /trades if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location = '/trades';
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) return null;

  const renderView = () => {
    switch (view) {
      case 'signup':
        return <SignupWindow onSwitchToLogin={() => setView('login')} />;
      case 'forgot':
        return <ForgotPasswordWindow onSwitchToLogin={() => setView('login')} />;
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
            <div className="text-accent font-mono text-2xl font-bold">100%</div>
            <div className="text-text-secondary text-sm mt-1">Secure</div>
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

          {renderView()}
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
