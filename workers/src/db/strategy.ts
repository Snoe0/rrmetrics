import type { SupabaseClient } from '@supabase/supabase-js';

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
    followed: row.followed,
  };
}

function dailyCheckRowToAPI(row: any): DailyRuleCheckAPI {
  return {
    _id: row.id,
    ruleId: row.rule_id,
    checkDate: row.check_date,
    followed: row.followed,
  };
}

// --- Strategy Rules ---

export async function getRules(
  supabase: SupabaseClient,
  userId: string,
): Promise<StrategyRuleAPI[]> {
  const { data, error } = await supabase
    .from('strategy_rules')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(ruleRowToAPI);
}

export async function createRule(
  supabase: SupabaseClient,
  userId: string,
  label: string,
  type: 'trade' | 'day',
): Promise<StrategyRuleAPI> {
  // Get next sort_order
  const { data: existing } = await supabase
    .from('strategy_rules')
    .select('sort_order')
    .eq('user_id', userId)
    .eq('type', type)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from('strategy_rules')
    .insert({ user_id: userId, label, type, sort_order: nextOrder })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return ruleRowToAPI(data);
}

export async function updateRule(
  supabase: SupabaseClient,
  userId: string,
  ruleId: string,
  updates: { label?: string; sortOrder?: number },
): Promise<StrategyRuleAPI> {
  const updateData: any = {};
  if (updates.label !== undefined) updateData.label = updates.label;
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

  const { data, error } = await supabase
    .from('strategy_rules')
    .update(updateData)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return ruleRowToAPI(data);
}

export async function deleteRule(
  supabase: SupabaseClient,
  userId: string,
  ruleId: string,
): Promise<void> {
  // Cascade deletes handled by FK constraints on trade_rule_checks and daily_rule_checks
  const { error } = await supabase
    .from('strategy_rules')
    .delete()
    .eq('id', ruleId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

// --- Trade Rule Checks ---

export async function getTradeRuleChecks(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
): Promise<TradeRuleCheckAPI[]> {
  const { data, error } = await supabase
    .from('trade_rule_checks')
    .select('*')
    .eq('user_id', userId)
    .eq('trade_id', tradeId);

  if (error) throw new Error(error.message);
  return (data || []).map(tradeCheckRowToAPI);
}

export async function getAllTradeRuleChecks(
  supabase: SupabaseClient,
  userId: string,
): Promise<TradeRuleCheckAPI[]> {
  const { data, error } = await supabase
    .from('trade_rule_checks')
    .select('*')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return (data || []).map(tradeCheckRowToAPI);
}

export async function upsertTradeRuleCheck(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
  ruleId: string,
  followed: boolean,
): Promise<TradeRuleCheckAPI> {
  const { data, error } = await supabase
    .from('trade_rule_checks')
    .upsert(
      { user_id: userId, trade_id: tradeId, rule_id: ruleId, followed },
      { onConflict: 'user_id,trade_id,rule_id' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return tradeCheckRowToAPI(data);
}

// --- Daily Rule Checks ---

export async function getDailyRuleChecks(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<DailyRuleCheckAPI[]> {
  const { data, error } = await supabase
    .from('daily_rule_checks')
    .select('*')
    .eq('user_id', userId)
    .eq('check_date', date);

  if (error) throw new Error(error.message);
  return (data || []).map(dailyCheckRowToAPI);
}

export async function getAllDailyRuleChecks(
  supabase: SupabaseClient,
  userId: string,
): Promise<DailyRuleCheckAPI[]> {
  const { data, error } = await supabase
    .from('daily_rule_checks')
    .select('*')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return (data || []).map(dailyCheckRowToAPI);
}

export async function upsertDailyRuleCheck(
  supabase: SupabaseClient,
  userId: string,
  ruleId: string,
  date: string,
  followed: boolean,
): Promise<DailyRuleCheckAPI> {
  const { data, error } = await supabase
    .from('daily_rule_checks')
    .upsert(
      { user_id: userId, rule_id: ruleId, check_date: date, followed },
      { onConflict: 'user_id,rule_id,check_date' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return dailyCheckRowToAPI(data);
}
