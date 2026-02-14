const express = require('express');
const controllers = require('./controllers');
const mid = require('./middleware');

const router = (app) => {
  app.get('/getTrades', mid.requiresLogin, controllers.Trade.getTrades);
  app.post('/makeTrade', mid.requiresLogin, controllers.Trade.makeTrade);
  app.post('/removeTrade', mid.requiresLogin, controllers.Trade.removeTrade);
  app.post('/updateTrade', mid.requiresLogin, controllers.Trade.updateTrade);
  app.post('/importTrades', mid.requiresLogin, controllers.Trade.bulkImportTrades);

  app.get('/getTags', mid.requiresLogin, controllers.Tag.getTags);
  app.post('/makeTag', mid.requiresLogin, controllers.Tag.makeTag);
  app.post('/updateTag', mid.requiresLogin, controllers.Tag.updateTag);
  app.post('/removeTag', mid.requiresLogin, controllers.Tag.removeTag);

  app.get('/login', mid.requiresSecure, mid.requiresLogout, controllers.Account.loginPage);
  app.post('/login', mid.requiresSecure, mid.requiresLogout, controllers.Account.login);

  app.post('/signup', mid.requiresSecure, mid.requiresLogout, controllers.Account.signup);
  app.post('/auth/google', mid.requiresSecure, mid.requiresLogout, controllers.Account.googleLogin);

  app.get('/logout', mid.requiresLogin, controllers.Account.logout);

  app.get('/trades', mid.requiresLogin, controllers.Trade.tradePage);
  app.post('/trades', mid.requiresLogin, controllers.Trade.makeTrade);

  app.get('/changePass', mid.requiresLogin, controllers.Account.changePassPage);
  app.post('/changePass', mid.requiresLogin, controllers.Account.changePass);

  app.get('/subscriptionStatus', mid.requiresLogin, mid.checkSubscriptionStatus, controllers.Account.getSubscriptionStatus);

  app.get('/api/account', mid.requiresLogin, controllers.Account.getAccount);
  app.post('/api/preferences/theme', mid.requiresLogin, controllers.Account.updateTheme);

  app.post('/api/tradovate/credentials', mid.requiresLogin, controllers.Tradovate.saveCredentials);
  app.post('/api/tradovate/sync', mid.requiresLogin, controllers.Tradovate.syncTrades);
  app.get('/api/tradovate/status', mid.requiresLogin, controllers.Tradovate.getStatus);
  app.delete('/api/tradovate/credentials', mid.requiresLogin, controllers.Tradovate.deleteCredentials);

  // Stripe routes
  app.post('/api/stripe/create-checkout-session', mid.requiresLogin, controllers.Stripe.createCheckoutSession);
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), controllers.Stripe.handleWebhook);

  // Upgrade page
  app.get('/upgrade', mid.requiresLogin, controllers.Account.upgradePage);

  // Landing page (public)
  app.get('/', controllers.Account.landingPage);
};

module.exports = router;
