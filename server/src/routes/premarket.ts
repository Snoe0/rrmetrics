import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as premarketDb from '../db/premarket';
import { requiresLogin } from '../middleware/auth';
import { encrypt } from '../utils/crypto';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const premarket = new Hono<HonoEnv>();

// GET /api/premarket/checklist — fetch items + today's completions + settings
premarket.get('/api/premarket/checklist', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const date = c.req.query('date');

  if (!date) {
    return c.json({ error: 'date query param is required' }, 400);
  }

  try {
    const [items, completions, settings] = await Promise.all([
      premarketDb.getChecklistItems(db, user.id),
      premarketDb.getCompletions(db, user.id, date),
      premarketDb.getSettings(db, user.id),
    ]);

    return c.json({ items, completions, settings });
  } catch (err) {
    console.error('getChecklist error:', err);
    return c.json({ error: 'Failed to fetch checklist' }, 500);
  }
});

// POST /api/premarket/checklist — add a new item
premarket.post('/api/premarket/checklist', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { label, sortOrder } = body;

  if (!label) {
    return c.json({ error: 'label is required' }, 400);
  }

  try {
    const item = await premarketDb.createChecklistItem(db, user.id, {
      label,
      sortOrder: sortOrder ?? 0,
    });
    return c.json(item);
  } catch (err) {
    console.error('createChecklistItem error:', err);
    return c.json({ error: 'Failed to create item' }, 500);
  }
});

// PUT /api/premarket/checklist/:id — update an item
premarket.put('/api/premarket/checklist/:id', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const itemId = c.req.param('id');
  const body = await c.req.json();

  try {
    const item = await premarketDb.updateChecklistItem(db, user.id, itemId, body);
    return c.json(item);
  } catch (err) {
    console.error('updateChecklistItem error:', err);
    return c.json({ error: 'Failed to update item' }, 500);
  }
});

// DELETE /api/premarket/checklist/:id — delete an item
premarket.delete('/api/premarket/checklist/:id', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const itemId = c.req.param('id');

  try {
    await premarketDb.deleteChecklistItem(db, user.id, itemId);
    return c.json({ message: 'Item deleted' });
  } catch (err) {
    console.error('deleteChecklistItem error:', err);
    return c.json({ error: 'Failed to delete item' }, 500);
  }
});

// POST /api/premarket/checklist/reorder — reorder items
premarket.post('/api/premarket/checklist/reorder', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { orderedIds } = body;

  if (!Array.isArray(orderedIds)) {
    return c.json({ error: 'orderedIds array is required' }, 400);
  }

  try {
    await premarketDb.reorderChecklistItems(db, user.id, orderedIds);
    return c.json({ message: 'Reordered' });
  } catch (err) {
    console.error('reorderChecklist error:', err);
    return c.json({ error: 'Failed to reorder' }, 500);
  }
});

// POST /api/premarket/checklist/toggle — toggle completion for today
premarket.post('/api/premarket/checklist/toggle', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { itemId, date } = body;

  if (!itemId || !date) {
    return c.json({ error: 'itemId and date are required' }, 400);
  }

  try {
    const result = await premarketDb.toggleCompletion(db, user.id, itemId, date);
    return c.json(result);
  } catch (err) {
    console.error('toggleCompletion error:', err);
    return c.json({ error: 'Failed to toggle' }, 500);
  }
});

// POST /api/premarket/settings — save reset time preference
premarket.post('/api/premarket/settings', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { resetTime, timezone } = body;

  if (!resetTime || !timezone) {
    return c.json({ error: 'resetTime and timezone are required' }, 400);
  }

  try {
    const settings = await premarketDb.upsertSettings(db, user.id, { resetTime, timezone });
    return c.json(settings);
  } catch (err) {
    console.error('upsertSettings error:', err);
    return c.json({ error: 'Failed to save settings' }, 500);
  }
});

// POST /api/premarket/webhook — save Discord webhook URL (encrypted)
premarket.post('/api/premarket/webhook', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { webhookUrl } = body;

  try {
    let encryptedUrl: string | null = null;
    if (webhookUrl && webhookUrl.trim()) {
      const url = webhookUrl.trim();
      if (!url.startsWith('https://discord.com/api/webhooks/')) {
        return c.json({ error: 'Invalid Discord webhook URL' }, 400);
      }
      encryptedUrl = await encrypt(url, c.env.ENCRYPTION_KEY);
    }

    const settings = await premarketDb.saveDiscordWebhook(db, user.id, encryptedUrl);
    return c.json(settings);
  } catch (err) {
    console.error('saveWebhook error:', err);
    return c.json({ error: 'Failed to save webhook' }, 500);
  }
});

// DELETE /api/premarket/webhook — remove Discord webhook
premarket.delete('/api/premarket/webhook', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  try {
    const settings = await premarketDb.saveDiscordWebhook(db, user.id, null);
    return c.json(settings);
  } catch (err) {
    console.error('deleteWebhook error:', err);
    return c.json({ error: 'Failed to remove webhook' }, 500);
  }
});

// GET /api/premarket/news — read economic events from DB (populated by cron)
premarket.get('/api/premarket/news', requiresLogin, async (c) => {
  const db = c.get('db');
  const date = c.req.query('date');
  if (!date) {
    return c.json({ error: 'date query param is required' }, 400);
  }

  try {
    const events = await premarketDb.getEconomicEvents(db, date);
    return c.json({ events });
  } catch (err) {
    console.error('getEconomicEvents error:', err);
    return c.json({ events: [], error: 'Failed to fetch economic events' });
  }
});

export default premarket;
