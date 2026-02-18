import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as strategyDb from '../db/strategy';
import { requiresLogin } from '../middleware/supabase-auth';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const strategy = new Hono<HonoEnv>();

// GET /api/strategy/rules — list all rules
strategy.get('/api/strategy/rules', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const rules = await strategyDb.getRules(supabase, user.id);
    return c.json({ rules });
  } catch (err) {
    console.error('getRules error:', err);
    return c.json({ error: 'Failed to fetch rules' }, 500);
  }
});

// POST /api/strategy/rules — create a rule
strategy.post('/api/strategy/rules', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();
  const { label, type } = body;

  if (!label || !type || !['trade', 'day'].includes(type)) {
    return c.json({ error: 'label and type (trade|day) are required' }, 400);
  }

  try {
    const rule = await strategyDb.createRule(supabase, user.id, label, type);
    return c.json(rule);
  } catch (err) {
    console.error('createRule error:', err);
    return c.json({ error: 'Failed to create rule' }, 500);
  }
});

// PUT /api/strategy/rules/:id — update a rule
strategy.put('/api/strategy/rules/:id', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const ruleId = c.req.param('id');
  const body = await c.req.json();

  try {
    const rule = await strategyDb.updateRule(supabase, user.id, ruleId, body);
    return c.json(rule);
  } catch (err) {
    console.error('updateRule error:', err);
    return c.json({ error: 'Failed to update rule' }, 500);
  }
});

// DELETE /api/strategy/rules/:id — delete a rule (cascade deletes checks)
strategy.delete('/api/strategy/rules/:id', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const ruleId = c.req.param('id');

  try {
    await strategyDb.deleteRule(supabase, user.id, ruleId);
    return c.json({ message: 'Rule deleted' });
  } catch (err) {
    console.error('deleteRule error:', err);
    return c.json({ error: 'Failed to delete rule' }, 500);
  }
});

// GET /api/strategy/checks/trade/:tradeId — checks for a trade
strategy.get('/api/strategy/checks/trade/:tradeId', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const tradeId = c.req.param('tradeId');

  try {
    const checks = await strategyDb.getTradeRuleChecks(supabase, user.id, tradeId);
    return c.json({ checks });
  } catch (err) {
    console.error('getTradeRuleChecks error:', err);
    return c.json({ error: 'Failed to fetch trade checks' }, 500);
  }
});

// POST /api/strategy/checks/trade — upsert trade rule check
strategy.post('/api/strategy/checks/trade', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();
  const { tradeId, ruleId, followed } = body;

  if (!tradeId || !ruleId || typeof followed !== 'boolean') {
    return c.json({ error: 'tradeId, ruleId, and followed (boolean) are required' }, 400);
  }

  try {
    const check = await strategyDb.upsertTradeRuleCheck(supabase, user.id, tradeId, ruleId, followed);
    return c.json(check);
  } catch (err) {
    console.error('upsertTradeRuleCheck error:', err);
    return c.json({ error: 'Failed to save trade check' }, 500);
  }
});

// GET /api/strategy/checks/daily/:date — checks for a date
strategy.get('/api/strategy/checks/daily/:date', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const date = c.req.param('date');

  try {
    const checks = await strategyDb.getDailyRuleChecks(supabase, user.id, date);
    return c.json({ checks });
  } catch (err) {
    console.error('getDailyRuleChecks error:', err);
    return c.json({ error: 'Failed to fetch daily checks' }, 500);
  }
});

// POST /api/strategy/checks/daily — upsert daily rule check
strategy.post('/api/strategy/checks/daily', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();
  const { ruleId, date, followed } = body;

  if (!ruleId || !date || typeof followed !== 'boolean') {
    return c.json({ error: 'ruleId, date, and followed (boolean) are required' }, 400);
  }

  try {
    const check = await strategyDb.upsertDailyRuleCheck(supabase, user.id, ruleId, date, followed);
    return c.json(check);
  } catch (err) {
    console.error('upsertDailyRuleCheck error:', err);
    return c.json({ error: 'Failed to save daily check' }, 500);
  }
});

// GET /api/strategy/analytics — per-rule stats
strategy.get('/api/strategy/analytics', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const [rules, allTradeChecks, allDailyChecks] = await Promise.all([
      strategyDb.getRules(supabase, user.id),
      strategyDb.getAllTradeRuleChecks(supabase, user.id),
      strategyDb.getAllDailyRuleChecks(supabase, user.id),
    ]);

    // Get trades for P&L correlation
    const { data: trades } = await supabase
      .from('trades')
      .select('id, enter_price, exit_price, quantity, manual_pl')
      .eq('user_id', user.id);

    const tradeMap: Record<string, number> = {};
    if (trades) {
      for (const t of trades) {
        const pl = t.manual_pl !== null && t.manual_pl !== undefined
          ? t.manual_pl
          : (t.exit_price - t.enter_price) * t.quantity;
        tradeMap[t.id] = pl;
      }
    }

    const analytics = rules.map((rule) => {
      if (rule.type === 'trade') {
        const checks = allTradeChecks.filter((ch) => ch.ruleId === rule._id);
        const total = checks.length;
        const followed = checks.filter((ch) => ch.followed);
        const broken = checks.filter((ch) => !ch.followed);

        const followedPLs = followed.map((ch) => tradeMap[ch.tradeId] ?? 0);
        const brokenPLs = broken.map((ch) => tradeMap[ch.tradeId] ?? 0);

        const avgPLFollowed = followedPLs.length > 0
          ? followedPLs.reduce((s, v) => s + v, 0) / followedPLs.length
          : 0;
        const avgPLBroken = brokenPLs.length > 0
          ? brokenPLs.reduce((s, v) => s + v, 0) / brokenPLs.length
          : 0;

        return {
          ruleId: rule._id,
          label: rule.label,
          type: rule.type,
          total,
          followedCount: followed.length,
          brokenCount: broken.length,
          adherenceRate: total > 0 ? (followed.length / total) * 100 : 0,
          avgPLFollowed,
          avgPLBroken,
        };
      } else {
        // day rule
        const checks = allDailyChecks.filter((ch) => ch.ruleId === rule._id);
        const total = checks.length;
        const followed = checks.filter((ch) => ch.followed);

        return {
          ruleId: rule._id,
          label: rule.label,
          type: rule.type,
          total,
          followedCount: followed.length,
          brokenCount: total - followed.length,
          adherenceRate: total > 0 ? (followed.length / total) * 100 : 0,
          avgPLFollowed: 0,
          avgPLBroken: 0,
        };
      }
    });

    // Overall discipline score
    const totalChecks = analytics.reduce((s, a) => s + a.total, 0);
    const totalFollowed = analytics.reduce((s, a) => s + a.followedCount, 0);
    const disciplineScore = totalChecks > 0 ? (totalFollowed / totalChecks) * 100 : 0;

    return c.json({ analytics, disciplineScore });
  } catch (err) {
    console.error('getAnalytics error:', err);
    return c.json({ error: 'Failed to compute analytics' }, 500);
  }
});

export default strategy;
