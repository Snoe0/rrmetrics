const controllers = require('./controllers');
const mid = require('./middleware');

const router = (app) => {
  app.get('/getTrades', mid.requiresLogin, controllers.Trade.getTrades);
  app.post('/makeTrade', mid.requiresLogin, controllers.Trade.makeTrade);
  app.post('/removeTrade', mid.requiresLogin, controllers.Trade.removeTrade);
  app.post('/updateTrade', mid.requiresLogin, controllers.Trade.updateTrade);

  app.get('/login', mid.requiresSecure, mid.requiresLogout, controllers.Account.loginPage);
  app.post('/login', mid.requiresSecure, mid.requiresLogout, controllers.Account.login);

  app.post('/signup', mid.requiresSecure, mid.requiresLogout, controllers.Account.signup);

  app.get('/logout', mid.requiresLogin, controllers.Account.logout);

  app.get('/trades', mid.requiresLogin, controllers.Trade.tradePage);
  app.post('/trades', mid.requiresLogin, controllers.Trade.makeTrade);

  app.get('/', mid.requiresSecure, mid.requiresLogout, controllers.Account.loginPage);
};

module.exports = router;
