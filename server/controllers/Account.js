const nodemailer = require('nodemailer');
const models = require('../models');

const { Account } = models;

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  : null;

const landingPage = (req, res) => {
  if (req.session.account) {
    return res.redirect('/trades');
  }
  return res.render('landing');
};

const loginPage = (req, res) => res.render('login');

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
  const email = req.body.email ? `${req.body.email}`.trim().toLowerCase() : null;

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
      email: email || null,
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

const changePass = (req, res) => {
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
      await Account.findByIdAndUpdate(account._id, { password: hash });
      return res.json({ redirect: '/trades' });
    } catch (saveErr) {
      console.error(saveErr);
      return res.status(500).json({ error: 'An error occurred.' });
    }
  });
};

const forgotPassword = async (req, res) => {
  const username = `${req.body.username}`.trim();
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  try {
    const result = await Account.generateResetToken(username);

    if (!result) {
      // Always return success to avoid leaking whether account/email exists
      return res.json({ message: 'If an account with that username exists and has an email on file, a reset link has been sent.' });
    }

    if (!transporter) {
      console.error('SMTP not configured. Reset token for', username, ':', result.token);
      return res.json({ message: 'Reset link sent.' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/login?reset=${result.token}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: result.email,
      subject: 'RR Metrics - Password Reset',
      text: `You requested a password reset.\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a> (expires in 1 hour).</p><p>If you didn't request this, ignore this email.</p>`,
    });

    return res.json({ message: 'Reset link sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'An error occurred. Please try again.' });
  }
};

const resetPassword = async (req, res) => {
  const { token, pass, pass2 } = req.body;

  if (!token || !pass || !pass2) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (pass !== pass2) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  try {
    const account = await Account.findByResetToken(token);
    if (!account) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const hash = await Account.generateHash(pass);
    account.password = hash;
    account.resetToken = null;
    account.resetExpires = null;
    await account.save();

    return res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'An error occurred. Please try again.' });
  }
};

const getAccount = (req, res) => res.json({ account: req.session.account });

const updateTheme = async (req, res) => {
  const { theme, customColors } = req.body;
  if (!theme || !['dark', 'light', 'custom'].includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme.' });
  }

  try {
    const doc = await Account.findById(req.session.account._id).exec();
    if (!doc) return res.status(404).json({ error: 'Account not found.' });

    doc.theme = theme;
    if (theme === 'custom' && customColors) {
      const validHex = /^#[0-9A-Fa-f]{6}$/;
      const fields = ['bgPage', 'bgSurface', 'textPrimary', 'accent', 'positive', 'negative'];
      fields.forEach((f) => {
        if (customColors[f] && validHex.test(customColors[f])) {
          doc.customColors[f] = customColors[f];
        }
      });
      doc.markModified('customColors');
    }
    await doc.save();
    req.session.account = Account.toAPI(doc);
    return res.json({ theme: doc.theme, customColors: doc.customColors });
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
  changePassPage,
  changePass,
  forgotPassword,
  resetPassword,
  getSubscriptionStatus,
  getAccount,
  updateTheme,
  upgradePage,
};
