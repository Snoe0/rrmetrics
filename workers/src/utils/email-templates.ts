/**
 * Branded HTML email templates for RR Metrics.
 * Dark theme matching the app's visual identity.
 */

interface TemplateVars {
  userName: string;
  promoCode?: string;
  upgradeUrl: string;
  unsubscribeUrl: string;
  appUrl: string;
}

/** Shared HTML wrapper with RR Metrics branding */
function brandedWrapper(content: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>RR Metrics</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">RR Metrics</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color:#12121a;border-radius:12px;padding:40px 32px;border:1px solid rgba(255,255,255,0.06);">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#6b7280;">
                &copy; ${new Date().getFullYear()} RR Metrics. All rights reserved.
              </p>
              <p style="margin:8px 0 0;font-size:11px;">
                <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe from these emails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
  <tr>
    <td align="center" style="border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);">
      <a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

function promoCodeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
  <tr>
    <td align="center" style="background-color:#1a1a2e;border:1px dashed #6366f1;border-radius:8px;padding:16px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Your exclusive code</p>
      <p style="margin:0;font-size:24px;font-weight:700;color:#6366f1;letter-spacing:2px;">${code}</p>
    </td>
  </tr>
</table>`;
}

function featureList(features: string[]): string {
  return features
    .map(
      (f) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#d1d5db;">
          <span style="color:#6366f1;margin-right:8px;">&#10003;</span>${f}
        </td></tr>`,
    )
    .join('');
}

// ─── Email 1: Trial Expired (Day 0) ───────────────────────────────────────────

export function trialExpiredEmail(vars: TemplateVars): { subject: string; html: string; text: string } {
  const subject = "Your RR Metrics trial has ended — here's 50% off";

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Hey ${vars.userName},</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
      Your 14-day free trial of RR Metrics has come to an end. We hope you got a taste of how a proper trading journal can sharpen your edge.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
      Here's what you're missing on the free plan:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${featureList([
        'Unlimited trade logging',
        'Advanced analytics & P&L breakdowns',
        'Broker sync (Tradovate, ProjectX)',
        'Strategy & rule tracking',
        'Premarket prep notes',
        'CSV import & export',
      ])}
    </table>
    <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
      As a thank you for trying us out, here's <strong style="color:#ffffff;">50% off your first month</strong>:
    </p>
    ${vars.promoCode ? promoCodeBlock(vars.promoCode) : ''}
    ${ctaButton('Upgrade Now — 50% Off', vars.upgradeUrl)}
  `;

  const text = `Hey ${vars.userName},

Your 14-day free trial of RR Metrics has ended.

Here's what you're missing:
- Unlimited trade logging
- Advanced analytics & P&L breakdowns
- Broker sync (Tradovate, ProjectX)
- Strategy & rule tracking
- Premarket prep notes
- CSV import & export

Use code ${vars.promoCode || '(check your email)'} for 50% off your first month.

Upgrade: ${vars.upgradeUrl}

Unsubscribe: ${vars.unsubscribeUrl}`;

  return { subject, html: brandedWrapper(content, vars.unsubscribeUrl), text };
}

// ─── Email 2: Follow-up Day 3 ─────────────────────────────────────────────────

export function followUp3dEmail(vars: TemplateVars): { subject: string; html: string; text: string } {
  const subject = 'Still thinking it over? Your 50% off code is waiting';

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Hey ${vars.userName},</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
      Just checking in — your exclusive 50% off code is still active. Here's a closer look at what RR Metrics Pro unlocks:
    </p>
    <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#ffffff;">Track Every Edge</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6;">
      Log trades automatically via broker sync, tag patterns, and see your P&L broken down by time, ticker, strategy, and more. Our analytics dashboard shows you where your real edge lives.
    </p>
    <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#ffffff;">Prepare Like a Pro</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6;">
      Premarket prep helps you set intentions before the bell. Strategy rules keep you disciplined. Review your journal and improve every week.
    </p>
    ${vars.promoCode ? promoCodeBlock(vars.promoCode) : ''}
    ${ctaButton('Claim Your 50% Off', vars.upgradeUrl)}
  `;

  const text = `Hey ${vars.userName},

Your exclusive 50% off code is still active: ${vars.promoCode || '(check your email)'}

RR Metrics Pro gives you:
- Automatic trade logging via broker sync
- P&L analytics by time, ticker, and strategy
- Premarket prep and strategy rules
- CSV import & export

Upgrade: ${vars.upgradeUrl}

Unsubscribe: ${vars.unsubscribeUrl}`;

  return { subject, html: brandedWrapper(content, vars.unsubscribeUrl), text };
}

// ─── Email 3: Follow-up Day 7 ─────────────────────────────────────────────────

export function followUp7dEmail(vars: TemplateVars): { subject: string; html: string; text: string } {
  const subject = 'Last chance: 50% off your first month of RR Metrics';

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Hey ${vars.userName},</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
      This is your last reminder — your 50% off code won't last forever. Traders who journal consistently see measurable improvement in their results.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
      RR Metrics Pro starts at just <strong style="color:#ffffff;">$6/month</strong> with your discount. That's less than a single losing tick on ES.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${featureList([
        'Unlimited trades — no more 50-trade cap',
        'Broker auto-sync — never manually log again',
        'Deep analytics — find your winning patterns',
        'Strategy rules — stay disciplined',
      ])}
    </table>
    ${vars.promoCode ? promoCodeBlock(vars.promoCode) : ''}
    ${ctaButton('Get 50% Off Before It Expires', vars.upgradeUrl)}
  `;

  const text = `Hey ${vars.userName},

Last reminder — your 50% off code is expiring soon: ${vars.promoCode || '(check your email)'}

RR Metrics Pro is just $6/month with your discount:
- Unlimited trades
- Broker auto-sync
- Deep analytics
- Strategy rules

Upgrade: ${vars.upgradeUrl}

Unsubscribe: ${vars.unsubscribeUrl}`;

  return { subject, html: brandedWrapper(content, vars.unsubscribeUrl), text };
}

// ─── Email 4+: Monthly Re-engagement ──────────────────────────────────────────

export function monthlyEmail(vars: TemplateVars): { subject: string; html: string; text: string } {
  const subject = "What's new at RR Metrics";

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Hey ${vars.userName},</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
      We've been building. RR Metrics keeps getting better — here's what's new:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${featureList([
        'Backtesting — test your strategies on historical data',
        'ProjectX broker integration',
        'Improved analytics with new chart views',
        'Referral program — earn commissions',
      ])}
    </table>
    <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
      Your free account is still active. Upgrade anytime to unlock everything.
    </p>
    ${ctaButton("See What You're Missing", vars.upgradeUrl)}
  `;

  const text = `Hey ${vars.userName},

What's new at RR Metrics:
- Backtesting — test strategies on historical data
- ProjectX broker integration
- Improved analytics with new charts
- Referral program — earn commissions

Your free account is still active. Upgrade anytime: ${vars.upgradeUrl}

Unsubscribe: ${vars.unsubscribeUrl}`;

  return { subject, html: brandedWrapper(content, vars.unsubscribeUrl), text };
}

// ─── Admin Mass Email Templates ───────────────────────────────────────────────

export interface AdminTemplate {
  name: string;
  subject: string;
  text: string;
  html: string;
}

export const ADMIN_TEMPLATES: AdminTemplate[] = [
  {
    name: 'New Feature Announcement',
    subject: 'New on RR Metrics: [Feature Name]',
    text: `Hey there,

We just shipped something new: [Feature Name].

[Brief description of the feature and how it helps traders.]

Check it out: https://rrmetrics.com/trades

— The RR Metrics Team`,
    html: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Something new just dropped</h1>
<p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">[Brief description of the feature and how it helps traders.]</p>`,
  },
  {
    name: 'General Update',
    subject: 'RR Metrics Update',
    text: `Hey there,

[Your update here.]

— The RR Metrics Team`,
    html: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Quick Update</h1>
<p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">[Your update here.]</p>`,
  },
];
