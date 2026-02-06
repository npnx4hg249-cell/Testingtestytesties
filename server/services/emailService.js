/**
 * Email Service for Shifter for ICES
 *
 * Handles email notifications for schedule changes and password resets.
 * Uses SMTP settings from database or environment variables.
 */

import nodemailer from 'nodemailer';
import { getAll, find, getById, getSettings } from '../data/store.js';

// Create transporter (lazy initialization)
let transporter = null;
let lastConfig = null;

/**
 * Get email configuration from database or environment
 */
function getEmailConfig() {
  const settings = getSettings();
  const smtp = settings.smtp || {};

  return {
    host: smtp.host || process.env.SMTP_HOST || 'localhost',
    port: parseInt(smtp.port || process.env.SMTP_PORT) || 587,
    secure: smtp.secure ?? (process.env.SMTP_SECURE === 'true'),
    auth: (smtp.user || process.env.SMTP_USER) ? {
      user: smtp.user || process.env.SMTP_USER,
      pass: smtp.pass || process.env.SMTP_PASS
    } : undefined,
    from: smtp.from || process.env.SMTP_FROM || 'shifter@example.com'
  };
}

/**
 * Get or create transporter with current config
 */
function getTransporter() {
  const config = getEmailConfig();
  const configKey = JSON.stringify(config);

  // Recreate transporter if config changed
  if (!transporter || lastConfig !== configKey) {
    transporter = nodemailer.createTransporter({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
    });
    lastConfig = configKey;
  }

  return transporter;
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured() {
  const config = getEmailConfig();
  return !!config.host && config.host !== 'localhost';
}

/**
 * Send an email
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    console.log('[Email] Service not configured, skipping email to:', to);
    return { sent: false, reason: 'Email service not configured' };
  }

  try {
    const config = getEmailConfig();
    const info = await getTransporter().sendMail({
      from: config.from,
      to,
      subject,
      text,
      html
    });

    console.log('[Email] Sent successfully:', info.messageId);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Failed to send:', error.message);
    throw error;
  }
}

/**
 * Send password to user email
 */
export async function sendPasswordEmail({ to, name, password, isReset = false }) {
  const subject = isReset
    ? 'Shifter for ICES - Your Password Has Been Reset'
    : 'Shifter for ICES - Your Account Password';

  const text = `Hello ${name},

${isReset ? 'Your password has been reset.' : 'Your account has been created.'}

Your new password is: ${password}

Please log in and change your password as soon as possible.

This is an automated notification from Shifter for ICES.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${isReset ? 'Password Reset' : 'Account Created'}</h2>
      <p>Hello ${name},</p>
      <p>${isReset ? 'Your password has been reset.' : 'Your account has been created.'}</p>
      <p style="background: #f5f5f5; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 16px;">
        Your new password is: <strong>${password}</strong>
      </p>
      <p style="color: #d9534f;">Please log in and change your password as soon as possible.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated notification from Shifter for ICES.</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}

/**
 * Notify all engineers about a new schedule
 */
export async function notifySchedulePublished(schedule) {
  const engineers = getAll('engineers').filter(e => e.isActive);
  const users = getAll('users');

  // Find users who have email notifications enabled
  const usersWithNotifications = users.filter(u => u.emailNotifications !== false);

  const results = [];

  for (const user of usersWithNotifications) {
    const subject = `[Shifter for ICES] New Schedule Published: ${schedule.month}`;
    const text = `A new shift schedule has been published for ${schedule.month}.

Please log in to Shifter for ICES to view your shifts.

This is an automated notification from Shifter for ICES.`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Schedule Published</h2>
        <p>A new shift schedule has been published for <strong>${schedule.month}</strong>.</p>
        <p>Please log in to Shifter for ICES to view your shifts.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated notification from Shifter for ICES.</p>
      </div>
    `;

    try {
      const result = await sendEmail({
        to: user.email,
        subject,
        text,
        html
      });
      results.push({ user: user.email, ...result });
    } catch (error) {
      results.push({ user: user.email, sent: false, error: error.message });
    }
  }

  return results;
}

/**
 * Notify an engineer about schedule changes affecting them
 */
export async function notifyScheduleChange(engineerId, schedule, changes) {
  const engineer = getById('engineers', engineerId);
  if (!engineer) return { sent: false, reason: 'Engineer not found' };

  const user = find('users', u => u.engineerId === engineerId)[0];
  if (!user || user.emailNotifications === false) {
    return { sent: false, reason: 'User not found or notifications disabled' };
  }

  const subject = `[Shifter for ICES] Your Schedule Has Changed: ${schedule.month}`;

  let changesList = changes.map(c =>
    `- ${c.date}: ${c.oldShift || 'None'} → ${c.newShift || 'None'}`
  ).join('\n');

  const text = `Your shift schedule for ${schedule.month} has been updated.

Changes:
${changesList}

Please log in to Shifter for ICES to view your full schedule.

This is an automated notification from Shifter for ICES.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Schedule Change Notification</h2>
      <p>Your shift schedule for <strong>${schedule.month}</strong> has been updated.</p>
      <h3>Changes:</h3>
      <ul>
        ${changes.map(c => `<li>${c.date}: ${c.oldShift || 'None'} → ${c.newShift || 'None'}</li>`).join('')}
      </ul>
      <p>Please log in to Shifter for ICES to view your full schedule.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated notification from Shifter for ICES.</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject,
    text,
    html
  });
}

export default {
  isEmailConfigured,
  sendEmail,
  sendPasswordEmail,
  notifySchedulePublished,
  notifyScheduleChange
};
