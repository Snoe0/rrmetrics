#!/usr/bin/env node

/**
 * MongoDB → D1 Data Migration Script
 *
 * One-time Node.js script that reads all data from MongoDB and outputs
 * SQL INSERT statements for D1.
 *
 * Usage:
 *   MONGODB_URI="mongodb://..." node scripts/migrate-mongo-to-d1.js > migration.sql
 *
 * Then apply:
 *   wrangler d1 execute tradingjournal-db --file=migration.sql
 *
 * Or for local testing:
 *   wrangler d1 execute tradingjournal-db --local --file=migration.sql
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

// ---- Config ----
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/TradeJournal';

// ---- ID Mapping ----
// Maps MongoDB ObjectId → UUID for consistent foreign key references
const idMap = new Map();

function mapId(objectId) {
  const key = objectId.toString();
  if (!idMap.has(key)) {
    idMap.set(key, crypto.randomUUID());
  }
  return idMap.get(key);
}

// ---- SQL Helpers ----
function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  // Escape single quotes by doubling them
  return `'${String(val).replace(/'/g, "''")}'`;
}

function dateStr(val) {
  if (!val) return 'NULL';
  return esc(new Date(val).toISOString());
}

// ---- Main ----
async function main() {
  console.log('-- MongoDB → D1 Migration');
  console.log(`-- Generated at: ${new Date().toISOString()}`);
  console.log('-- Apply with: wrangler d1 execute tradingjournal-db --file=migration.sql');
  console.log('');

  await mongoose.connect(MONGODB_URI);
  console.error(`Connected to MongoDB: ${MONGODB_URI}`);

  const db = mongoose.connection.db;

  // ---- Accounts ----
  const accounts = await db.collection('accounts').find({}).toArray();
  console.error(`Found ${accounts.length} accounts`);

  console.log('-- Accounts');
  for (const acc of accounts) {
    const id = mapId(acc._id);
    console.log(
      `INSERT INTO accounts (id, username, password, email, is_premium, stripe_customer_id, stripe_subscription_id, subscription_plan, subscription_status, theme, custom_colors_bg_page, custom_colors_bg_surface, custom_colors_text_primary, custom_colors_accent, custom_colors_positive, custom_colors_negative, reset_token, reset_expires, tradovate_username, tradovate_password, tradovate_cid, tradovate_secret, tradovate_environment, tradovate_last_sync_time, created_date) VALUES (${esc(id)}, ${esc(acc.username)}, ${esc(acc.password)}, ${esc(acc.email || null)}, ${acc.isPremium ? 1 : 0}, ${esc(acc.stripeCustomerId || null)}, ${esc(acc.stripeSubscriptionId || null)}, ${esc(acc.subscriptionPlan || 'trial')}, ${esc(acc.subscriptionStatus || null)}, ${esc(acc.theme || 'dark')}, ${esc(acc.customColors?.bgPage || null)}, ${esc(acc.customColors?.bgSurface || null)}, ${esc(acc.customColors?.textPrimary || null)}, ${esc(acc.customColors?.accent || null)}, ${esc(acc.customColors?.positive || null)}, ${esc(acc.customColors?.negative || null)}, ${esc(acc.resetToken || null)}, ${dateStr(acc.resetExpires)}, ${esc(acc.tradovate?.username || null)}, ${esc(acc.tradovate?.password || null)}, ${esc(acc.tradovate?.cid || null)}, ${esc(acc.tradovate?.secret || null)}, ${esc(acc.tradovate?.environment || 'demo')}, ${dateStr(acc.tradovate?.lastSyncTime)}, ${dateStr(acc.createdDate || acc._id.getTimestamp())});`,
    );
  }
  console.log('');

  // ---- Tags ----
  const tags = await db.collection('tags').find({}).toArray();
  console.error(`Found ${tags.length} tags`);

  console.log('-- Tags');
  for (const tag of tags) {
    const id = mapId(tag._id);
    const ownerId = mapId(tag.owner);
    console.log(
      `INSERT INTO tags (id, name, color, owner) VALUES (${esc(id)}, ${esc(tag.name)}, ${esc(tag.color)}, ${esc(ownerId)});`,
    );
  }
  console.log('');

  // ---- Trades ----
  const trades = await db.collection('trades').find({}).toArray();
  console.error(`Found ${trades.length} trades`);

  console.log('-- Trades');
  for (const trade of trades) {
    const id = mapId(trade._id);
    const ownerId = mapId(trade.owner);
    const imageAttachments = JSON.stringify(trade.imageAttachments || []);

    console.log(
      `INSERT INTO trades (id, ticker, enter_time, exit_time, enter_price, exit_price, quantity, manual_pl, image_attachments, screenshot, comments, tradovate_order_id, tradovate_source, owner, created_date) VALUES (${esc(id)}, ${esc(trade.ticker)}, ${dateStr(trade.enterTime)}, ${dateStr(trade.exitTime)}, ${trade.enterPrice}, ${trade.exitPrice}, ${trade.quantity}, ${trade.manualPL != null ? trade.manualPL : 'NULL'}, ${esc(imageAttachments)}, ${esc(trade.screenshot || null)}, ${esc(trade.comments || '')}, ${esc(trade.tradovateOrderId || null)}, ${esc(trade.tradovateSource || 'manual')}, ${esc(ownerId)}, ${dateStr(trade.createdDate || trade._id.getTimestamp())});`,
    );
  }
  console.log('');

  // ---- Trade Tags (junction table) ----
  console.log('-- Trade Tags');
  for (const trade of trades) {
    const tradeId = mapId(trade._id);
    if (trade.tags && trade.tags.length > 0) {
      for (const tagRef of trade.tags) {
        const tagId = mapId(tagRef);
        console.log(
          `INSERT INTO trade_tags (trade_id, tag_id) VALUES (${esc(tradeId)}, ${esc(tagId)});`,
        );
      }
    }
  }
  console.log('');

  // ---- Daily Notes ----
  const dailyNotes = await db.collection('dailynotes').find({}).toArray();
  console.error(`Found ${dailyNotes.length} daily notes`);

  console.log('-- Daily Notes');
  for (const note of dailyNotes) {
    const id = mapId(note._id);
    const ownerId = mapId(note.owner);
    console.log(
      `INSERT INTO daily_notes (id, date, content, owner) VALUES (${esc(id)}, ${esc(note.date)}, ${esc(note.content)}, ${esc(ownerId)});`,
    );
  }

  await mongoose.disconnect();
  console.error('Migration SQL generated successfully.');
  console.error(`Total: ${accounts.length} accounts, ${tags.length} tags, ${trades.length} trades, ${dailyNotes.length} daily notes`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
