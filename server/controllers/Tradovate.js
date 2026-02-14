const models = require('../models');
const { encrypt, decrypt } = require('../utils/crypto');
const TradovateAPI = require('../services/TradovateAPI');

const { Account } = models;
const { Trade } = models;

const saveCredentials = async (req, res) => {
  const {
    username, password, cid, secret, environment,
  } = req.body;

  if (!username || !password || !cid || !secret) {
    return res.status(400).json({ error: 'All Tradovate credential fields are required' });
  }

  if (environment && !['demo', 'live'].includes(environment)) {
    return res.status(400).json({ error: 'Environment must be demo or live' });
  }

  try {
    // Validate credentials by attempting auth
    const api = new TradovateAPI(environment || 'demo');
    await api.authenticate({
      username, password, cid, secret,
    });

    // Encrypt and save
    const account = await Account.findById(req.session.account._id).exec();
    if (!account) return res.status(404).json({ error: 'Account not found' });

    account.tradovate = {
      username: encrypt(username),
      password: encrypt(password),
      cid: encrypt(cid),
      secret: encrypt(secret),
      environment: environment || 'demo',
      lastSyncTime: account.tradovate ? account.tradovate.lastSyncTime : null,
    };

    await account.save();

    // Update session
    req.session.account = Account.toAPI(account);

    return res.json({ message: 'Tradovate credentials saved and validated' });
  } catch (err) {
    console.error('Tradovate credential save error:', err.message);
    return res.status(400).json({ error: `Failed to validate credentials: ${err.message}` });
  }
};

const syncTrades = async (req, res) => {
  try {
    const account = await Account.findById(req.session.account._id).exec();
    if (!account || !account.tradovate || !account.tradovate.username) {
      return res.status(400).json({ error: 'Tradovate credentials not configured' });
    }

    // Decrypt credentials
    const credentials = {
      username: decrypt(account.tradovate.username),
      password: decrypt(account.tradovate.password),
      cid: decrypt(account.tradovate.cid),
      secret: decrypt(account.tradovate.secret),
    };

    const api = new TradovateAPI(account.tradovate.environment);
    const authData = await api.authenticate(credentials);
    const token = authData.accessToken;

    // Fetch fills
    const fills = await api.getFills(token);

    if (!fills || fills.length === 0) {
      account.tradovate.lastSyncTime = new Date();
      await account.save();
      req.session.account = Account.toAPI(account);
      return res.json({ message: 'No fills found', synced: 0 });
    }

    // Resolve contract IDs to ticker names (cache to avoid repeated lookups)
    const contractCache = {};
    const resolveContract = async (contractId) => {
      if (contractCache[contractId]) return contractCache[contractId];
      try {
        const contract = await api.getContract(token, contractId);
        contractCache[contractId] = contract.name || `Contract-${contractId}`;
      } catch (err) {
        contractCache[contractId] = `Contract-${contractId}`;
      }
      return contractCache[contractId];
    };

    // Group fills by orderId to pair entries/exits
    const fillsByOrder = {};
    for (const fill of fills) {
      const orderId = fill.orderId || fill.id;
      if (!fillsByOrder[orderId]) {
        fillsByOrder[orderId] = [];
      }
      fillsByOrder[orderId].push(fill);
    }

    let syncedCount = 0;
    const source = `tradovate_${account.tradovate.environment}`;

    for (const [orderId, orderFills] of Object.entries(fillsByOrder)) {
      const tradovateOrderId = String(orderId);

      // Check if already synced
      const existing = await Trade.findOne({
        tradovateOrderId,
        owner: account._id,
      }).exec();

      if (existing) continue;

      // Use first fill for trade data
      const fill = orderFills[0];
      const ticker = await resolveContract(fill.contractId);
      const qty = orderFills.reduce((sum, f) => sum + (f.qty || 0), 0);
      const avgPrice = orderFills.reduce((sum, f) => sum + (f.price || 0) * (f.qty || 1), 0)
        / (qty || 1);

      const fillTime = new Date(fill.timestamp);

      const tradeData = {
        ticker,
        enterTime: fillTime,
        exitTime: fillTime,
        enterPrice: avgPrice,
        exitPrice: avgPrice,
        quantity: Math.abs(qty),
        tradovateOrderId,
        tradovateSource: source,
        owner: account._id,
      };

      try {
        const newTrade = new Trade(tradeData);
        await newTrade.save();
        syncedCount++;
      } catch (saveErr) {
        console.error(`Failed to save trade for order ${orderId}:`, saveErr.message);
      }
    }

    account.tradovate.lastSyncTime = new Date();
    await account.save();
    req.session.account = Account.toAPI(account);

    return res.json({ message: `Synced ${syncedCount} new trades`, synced: syncedCount });
  } catch (err) {
    console.error('Tradovate sync error:', err.message);
    return res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
};

const getStatus = async (req, res) => {
  try {
    const account = await Account.findById(req.session.account._id).exec();
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const configured = !!(account.tradovate && account.tradovate.username);

    return res.json({
      configured,
      environment: account.tradovate ? account.tradovate.environment : 'demo',
      lastSyncTime: account.tradovate ? account.tradovate.lastSyncTime : null,
    });
  } catch (err) {
    console.error('Tradovate status error:', err.message);
    return res.status(500).json({ error: 'Failed to get Tradovate status' });
  }
};

const deleteCredentials = async (req, res) => {
  try {
    const account = await Account.findById(req.session.account._id).exec();
    if (!account) return res.status(404).json({ error: 'Account not found' });

    account.tradovate = {
      username: null,
      password: null,
      cid: null,
      secret: null,
      environment: 'demo',
      lastSyncTime: null,
    };

    await account.save();
    req.session.account = Account.toAPI(account);

    return res.json({ message: 'Tradovate credentials removed' });
  } catch (err) {
    console.error('Tradovate delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete credentials' });
  }
};

module.exports = {
  saveCredentials,
  syncTrades,
  getStatus,
  deleteCredentials,
};
