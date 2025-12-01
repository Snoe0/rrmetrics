const models = require('../models');

const { Trade } = models;

const tradePage = (req, res) => res.render('app');

const makeTrade = async (req, res) => {
  if (!req.body.ticker || !req.body.enterTime || !req.body.exitTime || !req.body.enterPrice || !req.body.exitPrice || !req.body.quantity) {
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
    comments: req.body.comments || '',
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
      comments: newTrade.comments,
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
    const docs = await Trade.find(query).select('ticker enterTime exitTime enterPrice exitPrice quantity manualPL imageAttachments comments').lean().exec();

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

module.exports = {
  tradePage,
  makeTrade,
  getTrades,
  removeTrade,
};
