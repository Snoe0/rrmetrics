const bcrypt = require('bcrypt');
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
    required: function () { return !this.googleId; },
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
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
    enum: ['dark', 'light'],
    default: 'dark',
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
  createdDate: doc.createdDate,
  hasPassword: !!doc.password,
  isGoogleAccount: !!doc.googleId,
  tradovate: {
    configured: !!(doc.tradovate && doc.tradovate.username),
    environment: doc.tradovate ? doc.tradovate.environment : 'demo',
    lastSyncTime: doc.tradovate ? doc.tradovate.lastSyncTime : null,
  },
});

AccountSchema.statics.findOrCreateGoogleUser = async function findOrCreateGoogleUser(googleId, email) {
  let doc = await this.findOne({ googleId }).exec();
  if (doc) return doc;

  // Generate username from email prefix, ensure uniqueness
  let base = email.split('@')[0].replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 12);
  if (!base) base = 'user';
  let username = base;
  let suffix = 1;
  while (await this.findOne({ username }).exec()) {
    username = `${base}${suffix}`;
    suffix++;
  }

  doc = new this({ username, googleId });
  await doc.save();
  return doc;
};

AccountSchema.statics.generateHash = (password) => bcrypt.hash(password, saltRounds);

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
