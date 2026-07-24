/**
 * Seeds a demo account with realistic trading history.
 * Usage: npm run seed-demo
 * Login afterwards with demo@example.com / demo1234
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDb } from '../src/db/connection';
import * as profilesDb from '../src/db/profiles';
import * as tradesDb from '../src/db/trades';
import * as tagsDb from '../src/db/tags';
import * as dailyNotesDb from '../src/db/daily-notes';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo1234';

interface Instrument {
  ticker: string;
  tickValue: number;
  basePrice: number;
  tickSize: number;
}

const INSTRUMENTS: Instrument[] = [
  { ticker: 'NQ', tickValue: 5, basePrice: 20150, tickSize: 0.25 },
  { ticker: 'ES', tickValue: 12.5, basePrice: 5730, tickSize: 0.25 },
  { ticker: 'CL', tickValue: 10, basePrice: 78.4, tickSize: 0.01 },
  { ticker: 'GC', tickValue: 10, basePrice: 2680, tickSize: 0.1 },
];

const NOTE_SNIPPETS = [
  'Clean trend day. Waited for the pullback to VWAP and took the continuation.',
  'Choppy open — sat on hands until the range broke. Patience paid off.',
  'Overtraded the first hour. Need to respect the two-strike rule.',
  'News spike stopped me out, then the setup triggered again without me. Frustrating but followed the plan.',
  'Best day of the month. One setup, one trade, done by 10:30.',
  'Took a revenge trade after the first loss. Cut it quickly, but it should never have happened.',
  'FOMC day — reduced size as planned and stayed green.',
  'Missed the A+ setup hesitating. Reviewing entry checklist tonight.',
];

// Deterministic PRNG so the demo data is reproducible run-to-run
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const main = async () => {
  const db = initDb();
  const rand = mulberry32(42);

  let profile = await profilesDb.findByEmail(db, DEMO_EMAIL);
  if (profile) {
    console.log(`Demo account already exists (${DEMO_EMAIL}) — skipping. Delete data/rrmetrics.db to reseed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  profile = await profilesDb.createProfile(db, { email: DEMO_EMAIL, passwordHash });
  // Demo data speaks for itself — skip the first-run onboarding questionnaire
  db.prepare('UPDATE profiles SET onboarding_completed = 1 WHERE id = ?').run(profile.id);

  const tagNames: Array<{ name: string; color: string }> = [
    { name: 'Breakout', color: '#22c55e' },
    { name: 'Pullback', color: '#3b82f6' },
    { name: 'Reversal', color: '#a855f7' },
    { name: 'News', color: '#f59e0b' },
    { name: 'A+ Setup', color: '#14b8a6' },
    { name: 'Forced', color: '#ef4444' },
  ];
  const tagIds: string[] = [];
  for (const tag of tagNames) {
    const created = await tagsDb.createTag(db, profile.id, tag);
    tagIds.push(created._id);
  }

  // ~55% win rate with winners ~1.6x losers — profitable but human
  const days = 90;
  const now = new Date();
  let totalTrades = 0;

  for (let d = days; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // markets closed
    if (rand() < 0.25) continue; // not every day is traded

    const tradesToday = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < tradesToday; i++) {
      const inst = INSTRUMENTS[Math.floor(rand() * INSTRUMENTS.length)];
      const isWin = rand() < 0.55;
      const long = rand() < 0.6;
      const quantity = 1 + Math.floor(rand() * 3);

      const ticks = isWin
        ? 8 + Math.floor(rand() * 40)
        : -(6 + Math.floor(rand() * 22));
      const signedTicks = long ? ticks : -ticks;

      const enter = new Date(day);
      enter.setHours(9 + Math.floor(rand() * 3), 30 + Math.floor(rand() * 29), 0, 0);
      const exit = new Date(enter.getTime() + (5 + Math.floor(rand() * 90)) * 60000);

      const drift = (rand() - 0.5) * inst.basePrice * 0.01;
      const enterPrice = +(inst.basePrice + drift).toFixed(2);
      const exitPrice = +(enterPrice + signedTicks * inst.tickSize).toFixed(2);

      const tags: string[] = [];
      if (rand() < 0.8) tags.push(tagIds[Math.floor(rand() * 3)]);
      if (isWin && rand() < 0.3) tags.push(tagIds[4]);
      if (!isWin && rand() < 0.2) tags.push(tagIds[5]);

      await tradesDb.createTrade(db, profile.id, {
        ticker: inst.ticker,
        enterTime: enter.toISOString(),
        exitTime: exit.toISOString(),
        enterPrice: long ? enterPrice : exitPrice,
        exitPrice: long ? exitPrice : enterPrice,
        quantity,
        manualPL: +(ticks * inst.tickValue * quantity).toFixed(2),
        comments: rand() < 0.4 ? NOTE_SNIPPETS[Math.floor(rand() * NOTE_SNIPPETS.length)] : '',
        account: 'Demo',
        tags,
      });
      totalTrades++;
    }

    if (rand() < 0.5) {
      await dailyNotesDb.upsertDailyNote(db, profile.id, {
        date: day.toISOString().slice(0, 10),
        content: NOTE_SNIPPETS[Math.floor(rand() * NOTE_SNIPPETS.length)],
      });
    }
  }

  console.log(`Seeded demo account ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
  console.log(`  ${totalTrades} trades, ${tagNames.length} tags across ${days} days`);
};

main();
