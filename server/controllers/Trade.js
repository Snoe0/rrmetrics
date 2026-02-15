const models = require('../models');

const { Trade } = models;

const tradePage = (req, res) => res.render('app');

const makeTrade = async (req, res) => {
  if (
    !req.body.ticker
    || !req.body.enterTime
    || !req.body.exitTime
    || !req.body.enterPrice
    || !req.body.exitPrice
    || !req.body.quantity
  ) {
    return res.status(400).json({ error: 'Ticker, enter time, exit time, enter price, exit price, and quantity are required!' });
  }

  const tradeData = {
    ticker: req.body.ticker,
    enterTime: req.body.enterTime,
    exitTime: req.body.exitTime,
    enterPrice: req.body.enterPrice,
    exitPrice: req.body.exitPrice,
    quantity: req.body.quantity,
    manualPL: req.body.manualPL || null,
    imageAttachments: req.body.imageAttachments || [],
    screenshot: req.body.screenshot || null,
    comments: req.body.comments || '',
    tags: req.body.tags || [],
    owner: req.session.account._id,
  };

  try {
    const newTrade = new Trade(tradeData);
    await newTrade.save();
    return res.status(201).json({
      ticker: newTrade.ticker,
      enterTime: newTrade.enterTime,
      exitTime: newTrade.exitTime,
      enterPrice: newTrade.enterPrice,
      exitPrice: newTrade.exitPrice,
      quantity: newTrade.quantity,
      manualPL: newTrade.manualPL,
      imageAttachments: newTrade.imageAttachments,
      screenshot: newTrade.screenshot,
      comments: newTrade.comments,
      tags: newTrade.tags,
    });
  } catch (err) {
    console.log(err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Trade already exists!' });
    }
    return res.status(500).json({ error: 'An error occurred' });
  }
};

const getTrades = async (req, res) => {
  try {
    const query = { owner: req.session.account._id };
    const docs = await Trade.find(query).select('ticker enterTime exitTime enterPrice exitPrice quantity manualPL imageAttachments screenshot comments tags').lean().exec();

    return res.json({ trades: docs });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Error retrieving trades!' });
  }
};

const removeTrade = async (req, res) => {
  if (!req.body._id) {
    return res.status(400).json({ error: 'Trade ID is required to delete!' });
  }

  try {
    const query = {
      _id: req.body._id,
      owner: req.session.account._id,
    };
    const deletedTrade = await Trade.findOneAndDelete(query).exec();

    if (!deletedTrade) {
      return res.status(404).json({ error: 'Trade not found!' });
    }

    return res.status(200).json({ message: 'Trade deleted successfully!' });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'An error occurred while deleting the trade!' });
  }
};

const updateTrade = async (req, res) => {
  if (!req.body._id) {
    return res.status(400).json({ error: 'Trade ID is required to update!' });
  }

  if (
    !req.body.ticker
    || !req.body.enterTime
    || !req.body.exitTime
    || !req.body.enterPrice
    || !req.body.exitPrice
    || !req.body.quantity
  ) {
    return res.status(400).json({ error: 'Ticker, enter time, exit time, enter price, exit price, and quantity are required!' });
  }

  try {
    const query = {
      _id: req.body._id,
      owner: req.session.account._id,
    };

    const updateData = {
      ticker: req.body.ticker,
      enterTime: req.body.enterTime,
      exitTime: req.body.exitTime,
      enterPrice: req.body.enterPrice,
      exitPrice: req.body.exitPrice,
      quantity: req.body.quantity,
      manualPL: req.body.manualPL || null,
      screenshot: req.body.screenshot || null,
      comments: req.body.comments || '',
      tags: req.body.tags || [],
    };

    const updatedTrade = await Trade.findOneAndUpdate(
      query,
      updateData,
      { new: true, runValidators: true },
    ).exec();

    if (!updatedTrade) {
      return res.status(404).json({ error: 'Trade not found!' });
    }

    return res.status(200).json({
      ticker: updatedTrade.ticker,
      enterTime: updatedTrade.enterTime,
      exitTime: updatedTrade.exitTime,
      enterPrice: updatedTrade.enterPrice,
      exitPrice: updatedTrade.exitPrice,
      quantity: updatedTrade.quantity,
      manualPL: updatedTrade.manualPL,
      screenshot: updatedTrade.screenshot,
      comments: updatedTrade.comments,
      tags: updatedTrade.tags,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'An error occurred while updating the trade!' });
  }
};

const bulkImportTrades = async (req, res) => {
  if (!req.body.trades || !Array.isArray(req.body.trades)) {
    return res.status(400).json({ error: 'An array of trades is required!' });
  }

  if (req.body.trades.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 trades per import!' });
  }

  const required = ['ticker', 'enterTime', 'exitTime', 'enterPrice', 'exitPrice', 'quantity'];

  for (let i = 0; i < req.body.trades.length; i++) {
    const t = req.body.trades[i];
    const missingField = required.find((field) => !t[field] && t[field] !== 0);
    if (missingField) {
      return res.status(400).json({ error: `Trade ${i + 1} is missing required field: ${missingField}` });
    }
  }

  try {
    const tradeDocs = req.body.trades.map((t) => ({
      ticker: String(t.ticker).toUpperCase().trim(),
      enterTime: new Date(t.enterTime),
      exitTime: new Date(t.exitTime),
      enterPrice: parseFloat(t.enterPrice),
      exitPrice: parseFloat(t.exitPrice),
      quantity: parseFloat(t.quantity),
      manualPL: t.manualPL ? parseFloat(t.manualPL) : null,
      comments: t.comments || '',
      tags: t.tags || [],
      owner: req.session.account._id,
    }));

    const result = await Trade.insertMany(tradeDocs);
    return res.status(201).json({ imported: result.length });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'An error occurred during import' });
  }
};

module.exports = {
  tradePage,
  makeTrade,
  getTrades,
  removeTrade,
  updateTrade,
  bulkImportTrades,
};
