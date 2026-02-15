const { OAuth2Client } = require('google-auth-library');
const models = require('../models');

const { Account } = models;

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const landingPage = (req, res) => {
  if (req.session.account) {
    return res.redirect('/trades');
  }
  return res.render('landing');
};

const loginPage = (req, res) => res.render('login', {
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
});

const logout = (req, res) => {
  req.session.destroy();
  res.redirect('/');
};

const login = (req, res) => {
  const username = `${req.body.username}`;
  const password = `${req.body.pass}`;

  if (!username || !password) {
    return res.status(400).json({ error: 'All fields are required!' });
  }

  return Account.authenticate(username, password, (err, account) => {
    if (err || !account) {
      return res.status(401).json({ error: 'Wrong username or password!' });
    }

    req.session.account = Account.toAPI(account);

    return res.json({ redirect: '/trades' });
  });
};

const signup = async (req, res) => {
  const username = `${req.body.username}`;
  const pass = `${req.body.pass}`;
  const pass2 = `${req.body.pass2}`;

  if (!username || !pass || !pass2) {
    return res.status(400).json({ error: 'All fields are required!' });
  }

  if (pass !== pass2) {
    return res.status(400).json({ error: 'Passwords do not match!' });
  }

  try {
    const hash = await Account.generateHash(pass);
    const newAccount = new Account({
      username,
      password: hash,
    });
    await newAccount.save();
    req.session.account = Account.toAPI(newAccount);
    return res.json({ redirect: '/trades' });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Username already in use.' });
    }
    return res.status(500).json({ error: 'An error occurred.' });
  }
};

const getSubscriptionStatus = (req, res) => {
  if (!req.subscriptionStatus) {
    return res.status(500).json({ error: 'Subscription status not available' });
  }

  return res.json({
    isPremium: req.subscriptionStatus.isPremium,
    isTrialActive: req.subscriptionStatus.isTrialActive,
    trialDaysRemaining: req.subscriptionStatus.trialDaysRemaining,
  });
};

const changePassPage = (req, res) => res.render('changePass');

const googleLogin = async (req, res) => {
  if (!googleClient) {
    return res.status(500).json({ error: 'Google Sign-In is not configured.' });
  }

  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required.' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;

    const account = await Account.findOrCreateGoogleUser(googleId, email);
    req.session.account = Account.toAPI(account);
    return res.json({ redirect: '/trades' });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(401).json({ error: 'Google authentication failed.' });
  }
};

const changePass = (req, res) => {
  // Guard: Google-only accounts without a password cannot change password
  if (req.session.account.isGoogleAccount && !req.session.account.hasPassword) {
    return res.status(400).json({ error: 'Google accounts cannot change password. Set a password first.' });
  }

  const oldPass = `${req.body.currentPass}`;
  const newPass = `${req.body.pass}`;
  const newPass2 = `${req.body.pass2}`;

  if (!oldPass || !newPass || !newPass2) {
    return res.status(400).json({ error: 'All fields are required!' });
  }

  if (newPass !== newPass2) {
    return res.status(400).json({ error: 'New passwords do not match!' });
  }

  return Account.authenticate(req.session.account.username, oldPass, async (err, account) => {
    if (err || !account) {
      return res.status(401).json({ error: 'Wrong password!' });
    }

    try {
      const hash = await Account.generateHash(newPass);
      account.password = hash;
      await account.save();
      return res.json({ redirect: '/trades' });
    } catch (saveErr) {
      console.error(saveErr);
      return res.status(500).json({ error: 'An error occurred.' });
    }
  });
};

const getAccount = (req, res) => res.json({ account: req.session.account });

const updateTheme = async (req, res) => {
  const { theme } = req.body;
  if (!theme || !['dark', 'light'].includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme. Must be "dark" or "light".' });
  }

  try {
    const doc = await Account.findById(req.session.account._id).exec();
    if (!doc) return res.status(404).json({ error: 'Account not found.' });

    doc.theme = theme;
    await doc.save();
    req.session.account = Account.toAPI(doc);
    return res.json({ theme: doc.theme });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update theme.' });
  }
};

const upgradePage = (req, res) => res.render('upgrade');

module.exports = {
  landingPage,
  loginPage,
  logout,
  login,
  signup,
  googleLogin,
  changePassPage,
  changePass,
  getSubscriptionStatus,
  getAccount,
  updateTheme,
  upgradePage,
};
