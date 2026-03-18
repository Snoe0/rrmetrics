/**
 * Email sender using Resend API (replaces nodemailer/SMTP).
 * No TCP sockets needed - pure HTTP fetch.
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(
  options: SendEmailOptions,
  apiKey: string,
  fromEmail: string,
): Promise<void> {
  if (!apiKey) {
    console.log('Resend API key not configured. Email not sent:', options.subject);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `RR Metrics <${fromEmail}>`,
      to: [options.to],
      subject: options.subject,
      text: options.text,
      html: options.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error: ${response.status} ${errorText}`);
  }
}
