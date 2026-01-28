const helper = require('./helper.js');
const React = require('react');
const { useState } = React;
const { createRoot } = require('react-dom/client');

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
}

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

const LoginWindow = ({ onSwitchToSignup }) => {
  return (
    <form id="loginForm"
      name="loginForm"
      onSubmit={handleLogin}
      action="/login"
      method="POST"
      className="mainForm"
    >
      <h3>Welcome Back</h3>
      <label htmlFor="username">Username</label>
      <input
        id="user"
        type="text"
        name="username"
        placeholder="Enter your username"
        autoComplete="username"
      />

      <label htmlFor="pass">Password</label>
      <input
        id="pass"
        type="password"
        name="pass"
        placeholder="Enter your password"
        autoComplete="current-password"
      />

      <input className="formSubmit" type="submit" value="Sign In"/>

      <p className="formToggle">
        Don't have an account?{' '}
        <button type="button" className="toggleLink" onClick={onSwitchToSignup}>
          Sign Up
        </button>
      </p>
    </form>
  );
};


const SignupWindow = ({ onSwitchToLogin }) => {
  return (
    <form id="signupForm"
      name="signupForm"
      onSubmit={handleSignup}
      action="/signup"
      method="POST"
      className="mainForm"
    >
      <h3>Create Account</h3>
      <label htmlFor="username">Username</label>
      <input
        id="user"
        type="text"
        name="username"
        placeholder="Choose a username"
        autoComplete="username"
      />

      <label htmlFor="pass">Password</label>
      <input
        id="pass"
        type="password"
        name="pass"
        placeholder="Create a password"
        autoComplete="new-password"
      />

      <label htmlFor="pass2">Confirm Password</label>
      <input
        id="pass2"
        type="password"
        name="pass2"
        placeholder="Confirm your password"
        autoComplete="new-password"
      />

      <input className="formSubmit" type="submit" value="Sign Up"/>

      <p className="formToggle">
        Already have an account?{' '}
        <button type="button" className="toggleLink" onClick={onSwitchToLogin}>
          Sign In
        </button>
      </p>
    </form>
  );
};

const App = () => {
  const [isLogin, setIsLogin] = useState(true);

  return isLogin ? (
    <LoginWindow onSwitchToSignup={() => setIsLogin(false)} />
  ) : (
    <SignupWindow onSwitchToLogin={() => setIsLogin(true)} />
  );
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;