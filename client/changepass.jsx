const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');
const { supabase } = require('./supabase.js');
require('./styles/globals.css');

const ChangePass = () => {
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location = '/login';
      } else {
        setChecking(false);
      }
    });
  }, []);

  const handleChangePass = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const currentPass = e.target.querySelector('#currentPass').value;
    const pass = e.target.querySelector('#pass').value;
    const pass2 = e.target.querySelector('#pass2').value;

    if (!currentPass || !pass || !pass2) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (pass !== pass2) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      password: pass,
      currentPassword: currentPass,
    });

    if (authError) {
      setError(authError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (checking) return null;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 bg-positive/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-positive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Password Updated</h2>
          <p className="text-text-secondary text-sm mb-8">Your password has been changed successfully.</p>
          <a href="/trades" className="bg-accent text-accent-text font-semibold px-8 py-3 rounded-lg hover:brightness-110 transition-all">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
          <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
        </div>

        <h2 className="text-2xl font-bold text-text-primary mb-1">Change Password</h2>
        <p className="text-text-secondary text-sm mb-8">Choose a new password for your account</p>

        {error && (
          <div className="mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
            <span className="text-negative text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleChangePass}>
          <div className="space-y-5">
            <div>
              <label htmlFor="currentPass" className="block text-sm font-medium text-text-secondary mb-2">Current Password</label>
              <input
                id="currentPass"
                type="password"
                name="currentPass"
                placeholder="Enter current password"
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>

            <div>
              <label htmlFor="pass" className="block text-sm font-medium text-text-secondary mb-2">New Password</label>
              <input
                id="pass"
                type="password"
                name="pass"
                placeholder="Enter new password"
                autoComplete="new-password"
                className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>

            <div>
              <label htmlFor="pass2" className="block text-sm font-medium text-text-secondary mb-2">Confirm New Password</label>
              <input
                id="pass2"
                type="password"
                name="pass2"
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
            {loading ? 'Updating...' : 'Change Password'}
          </button>

          <p className="text-center text-text-secondary text-sm mt-6">
            <a href="/trades" className="text-accent hover:underline font-medium">Back to Dashboard</a>
          </p>
        </form>
      </div>
    </div>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<ChangePass />);
};

window.onload = init;
