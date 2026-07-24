import type { Db } from './connection';
import { generateId } from '../utils/id';

interface StrategyRuleAPI {
  _id: string;
  label: string;
  type: 'trade' | 'day';
  sortOrder: number;
  createdAt: string;
}

interface RuleCheckAPI {
  _id: string;
  ruleId: string;
  followed: boolean;
}

interface TradeRuleCheckAPI extends RuleCheckAPI {
  tradeId: string;
}

interface DailyRuleCheckAPI extends RuleCheckAPI {
  checkDate: string;
}

function ruleRowToAPI(row: any): StrategyRuleAPI {
  return {
    _id: row.id,
    label: row.label,
    type: row.type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function tradeCheckRowToAPI(row: any): TradeRuleCheckAPI {
  return {
    _id: row.id,
    ruleId: row.rule_id,
    tradeId: row.trade_id,
    followed: !!row.followed,
  };
}

function dailyCheckRowToAPI(row: any): DailyRuleCheckAPI {
  return {
    _id: row.id,
    ruleId: row.rule_id,
    checkDate: row.check_date,
    followed: !!row.followed,
  };
}

// --- Strategy Rules ---

export async function getRules(
  db: Db,
  userId: string,
): Promise<StrategyRuleAPI[]> {
  const rows = db
    .prepare('SELECT * FROM strategy_rules WHERE user_id = ? ORDER BY sort_order ASC')
    .all(userId);
  return rows.map(ruleRowToAPI);
}

export async function createRule(
  db: Db,
  userId: string,
  label: string,
  type: 'trade' | 'day',
): Promise<StrategyRuleAPI> {
  // Get next sort_order
  const existing = db
    .prepare(
      `SELECT sort_order FROM strategy_rules
       WHERE user_id = ? AND type = ?
       ORDER BY sort_order DESC LIMIT 1`,
    )
    .get(userId, type) as { sort_order: number } | undefined;

  const nextOrder = existing ? existing.sort_order + 1 : 0;

  const id = generateId();
  db.prepare(
    `INSERT INTO strategy_rules (id, user_id, label, type, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, label, type, nextOrder, new Date().toISOString());

  const row = db
    .prepare('SELECT * FROM strategy_rules WHERE id = ? AND user_id = ?')
    .get(id, userId);
  return ruleRowToAPI(row);
}

export async function updateRule(
  db: Db,
  userId: string,
  ruleId: string,
  updates: { label?: string; sortOrder?: number },
): Promise<StrategyRuleAPI> {
  const columns: string[] = [];
  const values: unknown[] = [];
  if (updates.label !== undefined) {
    columns.push('label = ?');
    values.push(updates.label);
  }
  if (updates.sortOrder !== undefined) {
    columns.push('sort_order = ?');
    values.push(updates.sortOrder);
  }

  if (columns.length > 0) {
    const result = db
      .prepare(`UPDATE strategy_rules SET ${columns.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...values, ruleId, userId);
    if (result.changes === 0) throw new Error('Rule not found');
  }

  const row = db
    .prepare('SELECT * FROM strategy_rules WHERE id = ? AND user_id = ?')
    .get(ruleId, userId);
  if (!row) throw new Error('Rule not found');
  return ruleRowToAPI(row);
}

export async function deleteRule(
  db: Db,
  userId: string,
  ruleId: string,
): Promise<void> {
  // Cascade deletes handled by FK constraints on trade_rule_checks and daily_rule_checks
  db.prepare('DELETE FROM strategy_rules WHERE id = ? AND user_id = ?').run(ruleId, userId);
}

// --- Trade Rule Checks ---

export async function getTradeRuleChecks(
  db: Db,
  userId: string,
  tradeId: string,
): Promise<TradeRuleCheckAPI[]> {
  const rows = db
    .prepare('SELECT * FROM trade_rule_checks WHERE user_id = ? AND trade_id = ?')
    .all(userId, tradeId);
  return rows.map(tradeCheckRowToAPI);
}

export async function getAllTradeRuleChecks(
  db: Db,
  userId: string,
): Promise<TradeRuleCheckAPI[]> {
  const rows = db
    .prepare('SELECT * FROM trade_rule_checks WHERE user_id = ?')
    .all(userId);
  return rows.map(tradeCheckRowToAPI);
}

export async function upsertTradeRuleCheck(
  db: Db,
  userId: string,
  tradeId: string,
  ruleId: string,
  followed: boolean,
): Promise<TradeRuleCheckAPI> {
  db.prepare(
    `INSERT INTO trade_rule_checks (id, user_id, trade_id, rule_id, followed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, trade_id, rule_id) DO UPDATE SET followed = excluded.followed`,
  ).run(generateId(), userId, tradeId, ruleId, followed ? 1 : 0);

  const row = db
    .prepare(
      'SELECT * FROM trade_rule_checks WHERE user_id = ? AND trade_id = ? AND rule_id = ?',
    )
    .get(userId, tradeId, ruleId);
  return tradeCheckRowToAPI(row);
}

// --- Daily Rule Checks ---

export async function getDailyRuleChecks(
  db: Db,
  userId: string,
  date: string,
): Promise<DailyRuleCheckAPI[]> {
  const rows = db
    .prepare('SELECT * FROM daily_rule_checks WHERE user_id = ? AND check_date = ?')
    .all(userId, date);
  return rows.map(dailyCheckRowToAPI);
}

export async function getAllDailyRuleChecks(
  db: Db,
  userId: string,
): Promise<DailyRuleCheckAPI[]> {
  const rows = db
    .prepare('SELECT * FROM daily_rule_checks WHERE user_id = ?')
    .all(userId);
  return rows.map(dailyCheckRowToAPI);
}

export async function upsertDailyRuleCheck(
  db: Db,
  userId: string,
  ruleId: string,
  date: string,
  followed: boolean,
): Promise<DailyRuleCheckAPI> {
  db.prepare(
    `INSERT INTO daily_rule_checks (id, user_id, rule_id, check_date, followed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, rule_id, check_date) DO UPDATE SET followed = excluded.followed`,
  ).run(generateId(), userId, ruleId, date, followed ? 1 : 0);

  const row = db
    .prepare(
      'SELECT * FROM daily_rule_checks WHERE user_id = ? AND rule_id = ? AND check_date = ?',
    )
    .get(userId, ruleId, date);
  return dailyCheckRowToAPI(row);
}
