const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');

const saltRounds = 10;

let AccountModel = {};

const AccountSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    match: /^[A-Za-z0-9_\-.]{1,16}$/,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null,
  },
  isPremium: {
    type: Boolean,
    default: false,
  },
  stripeCustomerId: {
    type: String,
    default: null,
  },
  stripeSubscriptionId: {
    type: String,
    default: null,
  },
  subscriptionPlan: {
    type: String,
    enum: ['trial', 'pro', 'elite'],
    default: 'trial',
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'past_due', 'canceled', 'incomplete'],
    default: null,
  },
  theme: {
    type: String,
    enum: ['dark', 'light', 'custom'],
    default: 'dark',
  },
  customColors: {
    bgPage: { type: String, default: null },
    bgSurface: { type: String, default: null },
    textPrimary: { type: String, default: null },
    accent: { type: String, default: null },
    positive: { type: String, default: null },
    negative: { type: String, default: null },
  },
  resetToken: {
    type: String,
    default: null,
  },
  resetExpires: {
    type: Date,
    default: null,
  },
  tradovate: {
    username: { type: String, default: null },
    password: { type: String, default: null },
    cid: { type: String, default: null },
    secret: { type: String, default: null },
    environment: { type: String, enum: ['demo', 'live'], default: 'demo' },
    lastSyncTime: { type: Date, default: null },
  },
  createdDate: {
    type: Date,
    default: Date.now,
  },
});

// Converts a doc to a safe API representation.
AccountSchema.statics.toAPI = (doc) => ({
  username: doc.username,
  _id: doc._id,
  isPremium: doc.isPremium,
  subscriptionPlan: doc.subscriptionPlan || 'trial',
  subscriptionStatus: doc.subscriptionStatus || null,
  theme: doc.theme || 'dark',
  customColors: doc.customColors || {},
  createdDate: doc.createdDate,
  hasPassword: !!doc.password,
  hasEmail: !!doc.email,
  tradovate: {
    configured: !!(doc.tradovate && doc.tradovate.username),
    environment: doc.tradovate ? doc.tradovate.environment : 'demo',
    lastSyncTime: doc.tradovate ? doc.tradovate.lastSyncTime : null,
  },
});

AccountSchema.statics.generateHash = (password) => bcrypt.hash(password, saltRounds);

AccountSchema.statics.generateResetToken = async function generateResetToken(username) {
  const doc = await this.findOne({ username }).exec();
  if (!doc || !doc.email) return null;

  const token = crypto.randomBytes(32).toString('hex');
  doc.resetToken = crypto.createHash('sha256').update(token).digest('hex');
  doc.resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await doc.save();
  return { token, email: doc.email };
};

AccountSchema.statics.findByResetToken = async function findByResetToken(token) {
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const doc = await this.findOne({
    resetToken: hashed,
    resetExpires: { $gt: Date.now() },
  }).exec();
  return doc;
};

AccountSchema.statics.authenticate = async (username, password, callback) => {
  try {
    const doc = await AccountModel.findOne({ username }).exec();
    if (!doc) {
      return callback();
    }

    const match = await bcrypt.compare(password, doc.password);
    if (match) {
      return callback(null, doc);
    }
    return callback();
  } catch (err) {
    return callback(err);
  }
};

AccountModel = mongoose.model('Account', AccountSchema);
module.exports = AccountModel;
