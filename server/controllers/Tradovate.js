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

    // Group fills by orderId to pair entries/exits
    const fillsByOrder = fills.reduce((acc, fill) => {
      const orderId = fill.orderId || fill.id;
      if (!acc[orderId]) acc[orderId] = [];
      acc[orderId].push(fill);
      return acc;
    }, {});

    const source = `tradovate_${account.tradovate.environment}`;

    // Batch-check which orders are already synced
    const orderIds = Object.keys(fillsByOrder).map(String);
    const existingTrades = await Trade.find({
      tradovateOrderId: { $in: orderIds },
      owner: account._id,
    }).select('tradovateOrderId').lean().exec();
    const existingIds = new Set(existingTrades.map((t) => t.tradovateOrderId));

    // Pre-resolve all unique contract IDs in parallel
    const uniqueContractIds = [...new Set(fills.map((f) => f.contractId))];
    const contractNames = {};
    await Promise.all(uniqueContractIds.map(async (contractId) => {
      try {
        const contract = await api.getContract(token, contractId);
        contractNames[contractId] = contract.name || `Contract-${contractId}`;
      } catch (contractErr) {
        contractNames[contractId] = `Contract-${contractId}`;
      }
    }));

    // Build new trade documents (skip already synced)
    const newTrades = Object.entries(fillsByOrder)
      .filter(([orderId]) => !existingIds.has(String(orderId)))
      .map(([orderId, orderFills]) => {
        const fill = orderFills[0];
        const ticker = contractNames[fill.contractId];
        const qty = orderFills.reduce((sum, f) => sum + (f.qty || 0), 0);
        const avgPrice = orderFills.reduce(
          (sum, f) => sum + (f.price || 0) * (f.qty || 1),
          0,
        ) / (qty || 1);
        const fillTime = new Date(fill.timestamp);

        return {
          ticker,
          enterTime: fillTime,
          exitTime: fillTime,
          enterPrice: avgPrice,
          exitPrice: avgPrice,
          quantity: Math.abs(qty),
          tradovateOrderId: String(orderId),
          tradovateSource: source,
          owner: account._id,
        };
      });

    let syncedCount = 0;
    if (newTrades.length > 0) {
      try {
        const result = await Trade.insertMany(newTrades, { ordered: false });
        syncedCount = result.length;
      } catch (insertErr) {
        // ordered:false means valid docs are still inserted
        syncedCount = insertErr.insertedDocs ? insertErr.insertedDocs.length : 0;
        console.error('Some trades failed to save:', insertErr.message);
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
