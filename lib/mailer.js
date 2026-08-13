// lib/mailer.js
//
// Central SMTP transporter, built from the exact relay that you confirmed
// works in your Python test (relay.hostup.se:587 + STARTTLS).
//
// Required env vars (add to .env.local / your hosting provider's env panel):
//   SMTP_HOST=relay.hostup.se
//   SMTP_PORT=587
//   SMTP_FROM=no-reply@medaad.online
//   SMTP_USER=            (optional — leave empty if the relay is IP-whitelisted,
//                           exactly like your working python3 script which never called login())
//   SMTP_PASS=            (optional, only needed if SMTP_USER is set)
//
// DKIM signing (recommended so OTP mail doesn't land in spam / gets rejected
// by strict providers like Gmail/Outlook). Nodemailer signs the message
// itself with a private key before handing it to the relay — the relay does
// NOT need to support DKIM for this to work.
//   DKIM_DOMAIN=medaad.online
//   DKIM_SELECTOR=2026                (must match the DNS TXT record's selector)
//   DKIM_PRIVATE_KEY=                 (PEM private key; see DKIM_SETUP.md)
//     -> either the raw PEM with real newlines, OR a base64-encoded version
//        of the whole PEM file (handy for hosts that don't like multi-line
//        env vars — set DKIM_PRIVATE_KEY_BASE64 instead in that case)
//   DKIM_PRIVATE_KEY_BASE64=          (alternative to DKIM_PRIVATE_KEY above)

import nodemailer from 'nodemailer';

let cachedTransporter = null;

function loadDkimPrivateKey() {
  if (process.env.DKIM_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.DKIM_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  if (process.env.DKIM_PRIVATE_KEY) {
    // Allow the key to be stored with literal "\n" sequences (common when
    // pasting a multi-line PEM into a single-line env var UI).
    return process.env.DKIM_PRIVATE_KEY.includes('\\n')
      ? process.env.DKIM_PRIVATE_KEY.replace(/\\n/g, '\n')
      : process.env.DKIM_PRIVATE_KEY;
  }
  return null;
}

function buildTransporter() {
  const host = process.env.SMTP_HOST || 'relay.hostup.se';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const options = {
    host,
    port,
    secure: false, // false + STARTTLS on port 587, same as smtp.starttls() in the python script
    requireTLS: true,
  };

  // Only attach `auth` if credentials are actually configured — this mirrors
  // the python test script, which never calls smtp.login() at all.
  if (user && pass) {
    options.auth = { user, pass };
  }

  const dkimPrivateKey = loadDkimPrivateKey();
  const dkimDomain = process.env.DKIM_DOMAIN;
  const dkimSelector = process.env.DKIM_SELECTOR;

  if (dkimPrivateKey && dkimDomain && dkimSelector) {
    options.dkim = {
      domainName: dkimDomain,
      keySelector: dkimSelector,
      privateKey: dkimPrivateKey,
    };
  } else if (dkimPrivateKey || dkimDomain || dkimSelector) {
    // Partial config — fail loudly instead of silently sending unsigned mail.
    console.warn(
      'DKIM is partially configured (need DKIM_DOMAIN + DKIM_SELECTOR + ' +
        'DKIM_PRIVATE_KEY/DKIM_PRIVATE_KEY_BASE64 all set) — sending WITHOUT DKIM signing.'
    );
  }

  return nodemailer.createTransport(options);
}

export function getMailer() {
  if (!cachedTransporter) {
    cachedTransporter = buildTransporter();
  }
  return cachedTransporter;
}

/**
 * Sends a plain-text email through the Hostup relay.
 * Throws on failure — callers should catch and translate into an API error.
 */
export async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || 'no-reply@medaad.online';
  const transporter = getMailer();

  return transporter.sendMail({
    from: `Medaad <${from}>`,
    to,
    subject,
    text,
    html,
  });
}
