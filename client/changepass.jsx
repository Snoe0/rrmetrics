const helper = require('./helper.js');
const React = require('react');
const { createRoot } = require('react-dom/client');

// Setup sidebar toggle functionality
const setupSidebar = () => {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const accountBtn = document.getElementById('accountBtn');
  const accountDropdown = document.getElementById('accountDropdown');

  const toggleSidebar = () => {
    if (hamburgerBtn && sidebar && sidebarOverlay) {
      hamburgerBtn.classList.toggle('active');
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('active');
    }
  };

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', toggleSidebar);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
      toggleSidebar();
    }
  });

  if (accountBtn && accountDropdown) {
    accountBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      accountDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!accountDropdown.contains(e.target)) {
        accountDropdown.classList.remove('open');
      }
    });
  }
};

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
}

const ChangePass = (props) => {
  return (
    <form id="changePassForm"
      name="changePassForm"
      onSubmit={handleChangePass}
      action="/changePass"
      method="POST"
      className="mainForm"
    >
      <label htmlFor="currentpass">Current Password: </label>
      <input id="currentPass" type="password" name="currentpass" placeholder="current password" />
      <label htmlFor="pass">New Password: </label>
      <input id="pass" type="password" name="pass" placeholder="password" />
      <label htmlFor="pass2">New Password: </label>
      <input id="pass2" type="password" name="pass2" placeholder="password" />
      <input className="formSubmit" type="submit" value="Change Password" />
    </form>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<ChangePass />);
  setupSidebar();
};

window.onload = init;