const requiresLogin = (req, res, next) => {
  if (!req.session.account) {
    return res.redirect('/');
  }
  return next();
};

const requiresLogout = (req, res, next) => {
  if (req.session.account) {
    return res.redirect('/trades');
  }

  return next();
};

const requiresSecure = (req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  return next();
};

const bypassSecure = (req, res, next) => next();

const checkSubscriptionStatus = (req, res, next) => {
  if (!req.session.account) {
    return next();
  }

  const account = req.session.account;

  if (account.isPremium) {
    req.subscriptionStatus = {
      isPremium: true,
      isTrialActive: false,
      trialDaysRemaining: 0,
    };
    return next();
  }

  const TRIAL_DAYS = 7;
  const accountCreated = new Date(account.createdDate);
  const now = new Date();
  const daysSinceCreation = Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24));
  const trialDaysRemaining = Math.max(0, TRIAL_DAYS - daysSinceCreation);
  const isTrialActive = trialDaysRemaining > 0;

  req.subscriptionStatus = {
    isPremium: false,
    isTrialActive,
    trialDaysRemaining,
  };

  return next();
};

module.exports.requiresLogin = requiresLogin;
module.exports.requiresLogout = requiresLogout;
module.exports.checkSubscriptionStatus = checkSubscriptionStatus;

if (process.env.NODE_ENV === 'production') {
  module.exports.requiresSecure = requiresSecure;
} else {
  module.exports.requiresSecure = bypassSecure;
}
