import { sendJson, handleCors, badRequest } from './lib/utils.js';
import { sendEmail } from './lib/email.js';

const NOTIFY_EMAIL = 'vereli.app@gmail.com';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    badRequest(res, 'Method not allowed');
    return;
  }

  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    badRequest(res, 'name, email, and message are required');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    badRequest(res, 'Invalid email address');
    return;
  }

  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: email,
      subject: `Contact form: ${subject || 'General inquiry'}`,
      html: `
        <h2>New message from vereli.com contact form</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject || 'N/A')}</p>
        <hr>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      `,
    }).catch(err => console.error('Contact email error:', err));

    sendJson(res, 200, { data: { message: 'Message sent' } });
  } catch (err) {
    console.error('Contact form error:', err);
    sendJson(res, 500, { error: 'Failed to send message' });
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
