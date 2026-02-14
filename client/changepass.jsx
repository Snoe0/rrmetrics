const helper = require('./helper.js');
const React = require('react');
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');

const handleChangePass = (e) => {
  e.preventDefault();
  helper.hideError();

  const currentPass = e.target.querySelector('#currentPass').value;
  const pass = e.target.querySelector('#pass').value;
  const pass2 = e.target.querySelector('#pass2').value;

  if (!currentPass || !pass || !pass2) {
    helper.handleError('Password is empty');
    return false;
  }

  if (pass !== pass2) {
    helper.handleError('Passwords do not match');
    return false;
  }

  helper.sendPost(e.target.action, { currentPass, pass, pass2 });
  return false;
};

const ChangePass = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
          <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
        </div>

        <h2 className="text-2xl font-bold text-text-primary mb-1">Change Password</h2>
        <p className="text-text-secondary text-sm mb-8">Enter your current password and choose a new one</p>

        <div id="errorDiv" className="hidden mb-4 p-3 bg-negative/20 border border-negative/40 rounded-lg">
          <span id="errorMessage" className="text-negative text-sm"></span>
        </div>

        <form
          id="changePassForm"
          name="changePassForm"
          onSubmit={handleChangePass}
          action="/changePass"
          method="POST"
        >
          <div className="space-y-5">
            <div>
              <label htmlFor="currentPass" className="block text-sm font-medium text-text-secondary mb-2">Current Password</label>
              <input
                id="currentPass"
                type="password"
                name="currentpass"
                placeholder="Enter current password"
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
                className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all"
          >
            Change Password
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
