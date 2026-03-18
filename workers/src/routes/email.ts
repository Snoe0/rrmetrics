import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import { verifyUnsubscribeToken } from '../utils/unsubscribe';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const emailRoutes = new Hono<HonoEnv>();

// GET /api/email/unsubscribe?token=xxx (public — no auth required)
emailRoutes.get('/api/email/unsubscribe', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.html(unsubscribePage('Invalid link', 'This unsubscribe link is missing or malformed.', false));
  }

  const userId = await verifyUnsubscribeToken(token, c.env.ENCRYPTION_KEY);
  if (!userId) {
    return c.html(unsubscribePage('Link expired', 'This unsubscribe link has expired. Contact support if you need help.', false));
  }

  try {
    const supabase = createServiceClient(c.env);
    const { error } = await supabase
      .from('profiles')
      .update({ email_unsubscribed: true })
      .eq('id', userId);

    if (error) throw error;

    return c.html(unsubscribePage(
      'Unsubscribed',
      "You've been unsubscribed from RR Metrics emails. You won't receive any more marketing emails from us.",
      true,
    ));
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return c.html(unsubscribePage('Something went wrong', 'Please try again or contact support.', false), 500);
  }
});

function unsubscribePage(title: string, message: string, success: boolean): string {
  const color = success ? '#10b981' : '#ef4444';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — RR Metrics</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;max-width:400px;padding:40px 20px;">
    <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 8px;">${title}</h1>
    <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin:0 0 24px;">${message}</p>
    <div style="width:48px;height:4px;background:${color};border-radius:2px;margin:0 auto;"></div>
  </div>
</body>
</html>`;
}

export default emailRoutes;
