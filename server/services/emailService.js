/**
 * Email Service for ICES-Shifter
 *
 * Handles email notifications for schedule changes.
 * Designed to be extensible for different email providers.
 */

import nodemailer from 'nodemailer';
import { getAll, find, getById } from '../data/store.js';

// Email configuration from environment variables
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
};

// Create transporter (lazy initialization)
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransporter(EMAIL_CONFIG);
  }
  return transporter;
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured() {
  return !!process.env.SMTP_HOST;
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
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || 'ices-shifter@example.com',
      to,
      subject,
      text,
      html
    });

    console.log('[Email] Sent successfully:', info.messageId);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Failed to send:', error.message);
    return { sent: false, error: error.message };
  }
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
    // Check if this user is an engineer or manager
    const engineer = user.engineerId ? getById('engineers', user.engineerId) : null;

    const subject = `[ICES-Shifter] New Schedule Published: ${schedule.month}`;
    const text = `A new shift schedule has been published for ${schedule.month}.

Please log in to ICES-Shifter to view your shifts.

This is an automated notification from ICES-Shifter.`;

    const html = `
      <h2>New Schedule Published</h2>
      <p>A new shift schedule has been published for <strong>${schedule.month}</strong>.</p>
      <p>Please log in to ICES-Shifter to view your shifts.</p>
      <hr>
      <p style="color: #666; font-size: 12px;">This is an automated notification from ICES-Shifter.</p>
    `;

    const result = await sendEmail({
      to: user.email,
      subject,
      text,
      html
    });

    results.push({ user: user.email, ...result });
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

  const subject = `[ICES-Shifter] Your Schedule Has Changed: ${schedule.month}`;

  let changesList = changes.map(c =>
    `- ${c.date}: ${c.oldShift || 'None'} → ${c.newShift || 'None'}`
  ).join('\n');

  const text = `Your shift schedule for ${schedule.month} has been updated.

Changes:
${changesList}

Please log in to ICES-Shifter to view your full schedule.

This is an automated notification from ICES-Shifter.`;

  const html = `
    <h2>Schedule Change Notification</h2>
    <p>Your shift schedule for <strong>${schedule.month}</strong> has been updated.</p>
    <h3>Changes:</h3>
    <ul>
      ${changes.map(c => `<li>${c.date}: ${c.oldShift || 'None'} → ${c.newShift || 'None'}</li>`).join('')}
    </ul>
    <p>Please log in to ICES-Shifter to view your full schedule.</p>
    <hr>
    <p style="color: #666; font-size: 12px;">This is an automated notification from ICES-Shifter.</p>
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
  notifySchedulePublished,
  notifyScheduleChange
};
