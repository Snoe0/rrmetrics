const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');
const { supabase } = require('./supabase.js');
require('./styles/globals.css');

const GoogleSignInButton = ({ label }) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/trades`,
      },
    });
    if (error) {
      setLoading(false);
      console.error('Google sign-in error:', error.message);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span className="text-gray-700 font-medium text-sm">{loading ? 'Redirecting...' : label}</span>
    </button>
  );
};

const OrDivider = () => (
  <div className="flex items-center gap-3 my-6">
    <div className="flex-1 h-px bg-border" />
    <span className="text-text-muted text-xs uppercase tracking-wider">or</span>
    <div className="flex-1 h-px bg-border" />
  </div>
);

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

      <GoogleSignInButton label="Continue with Google" />
      <OrDivider />

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

      <GoogleSignInButton label="Sign up with Google" />
      <OrDivider />

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

      <p className="text-center text-text-muted text-xs mt-4">
        By signing up, you agree to our{' '}
        <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
      </p>

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

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/changePass`,
    });

    if (authError) {
      setError(authError.message);
    } else {
      setSubmitted(true);
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
