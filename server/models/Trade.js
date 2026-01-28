const mongoose = require('mongoose');
const _ = require('underscore');

const setString = (str) => _.escape(str).trim();

const TradeSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true,
    trim: true,
    set: setString,
  },
  enterTime: {
    type: Date,
    required: true,
  },
  exitTime: {
    type: Date,
    required: true,
  },
  enterPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  exitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
  },
  manualPL: {
    type: Number,
    required: false,
  },
  imageAttachments: {
    type: [String],
    required: false,
    default: [],
  },
  screenshot: {
    type: String,
    required: false,
    default: null,
  },
  comments: {
    type: String,
    required: false,
    set: setString,
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    required: true,
    ref: 'Account',
  },
  createdDate: {
    type: Date,
    default: Date.now,
  },
});

TradeSchema.statics.toAPI = (doc) => ({
  ticker: doc.ticker,
  enterTime: doc.enterTime,
  exitTime: doc.exitTime,
  enterPrice: doc.enterPrice,
  exitPrice: doc.exitPrice,
  quantity: doc.quantity,
  manualPL: doc.manualPL,
  imageAttachments: doc.imageAttachments,
  screenshot: doc.screenshot,
  comments: doc.comments,
});

const TradeModel = mongoose.model('Trade', TradeSchema);
module.exports = TradeModel;
