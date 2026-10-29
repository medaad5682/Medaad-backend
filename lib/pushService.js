// lib/pushService.js
// ------------------------------------------------------------------
// One entry point for ALL push notifications (FCM + Huawei HMS).
// Call sites pass a neutral payload; this file decides the provider.
//
// payload = {
//   title: string,
//   body: string,
//   type: string,                 // e.g. 'subscription_decision'
//   data?: { [k]: any },          // extra routing data (converted to strings)
//   channelId?: string            // default 'fcm_channel'
// }
//
// Rules:
//  - Never throws (same contract as notifyHelper today).
//  - A user gets ONE provider only: never FCM + HMS together.
//  - Topic messages go to BOTH networks (devices subscribe on their own side).
// ------------------------------------------------------------------

import admin from './firebaseAdmin';
import { supabase } from './supabaseClient';
import { sendHmsToTokens, sendHmsToTopic, isHmsConfigured } from './hmsPush';

const DEFAULT_CHANNEL_ID = 'fcm_channel';
const CLICK_ACTION = 'FLUTTER_NOTIFICATION_CLICK';
const FCM_MULTICAST_LIMIT = 500;

// Use this in `.select(...)` wherever a call site loads a user to notify.
export const PUSH_USER_COLUMNS = 'id, fcm_token, hms_token, push_provider';

// ---------- helpers ----------

function stringifyData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

function buildFcmMessage(payload) {
  return {
    notification: { title: payload.title, body: payload.body },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        priority: 'max',
        channelId: payload.channelId || DEFAULT_CHANNEL_ID,
        clickAction: CLICK_ACTION
      }
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } }
    },
    data: stringifyData({
      click_action: CLICK_ACTION,
      type: payload.type,
      ...payload.data
    })
  };
}

/**
 * Decide where one user's push goes.
 * Returns { provider: 'fcm' | 'hms', token } or null when the user has no token.
 */
export function pickTarget(user) {
  if (!user) return null;
  const preferHms = user.push_provider === 'hms';

  if (preferHms && user.hms_token) return { provider: 'hms', token: user.hms_token };
  if (!preferHms && user.fcm_token) return { provider: 'fcm', token: user.fcm_token };

  // Defensive fallback: provider flag and token column disagree.
  if (user.hms_token) return { provider: 'hms', token: user.hms_token };
  if (user.fcm_token) return { provider: 'fcm', token: user.fcm_token };
  return null;
}

export function hasPushToken(user) {
  return pickTarget(user) !== null;
}

async function clearInvalidHmsTokens(tokens) {
  if (!tokens || tokens.length === 0) return;
  try {
    await supabase.from('users').update({ hms_token: null }).in('hms_token', tokens);
  } catch (err) {
    console.error('⚠️ [push] failed to clear invalid HMS tokens:', err.message);
  }
}

async function sendFcmToTokens(tokens, payload) {
  const result = { success: 0, failure: 0 };
  const list = Array.from(new Set((tokens || []).filter(Boolean)));
  if (list.length === 0) return result;

  const message = buildFcmMessage(payload);
  for (let i = 0; i < list.length; i += FCM_MULTICAST_LIMIT) {
    const chunk = list.slice(i, i + FCM_MULTICAST_LIMIT);
    try {
      if (chunk.length === 1) {
        await admin.messaging().send({ ...message, token: chunk[0] });
        result.success += 1;
      } else {
        const res = await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
        result.success += res.successCount;
        result.failure += res.failureCount;
      }
    } catch (err) {
      result.failure += chunk.length;
      console.error('⚠️ [push] FCM send error:', err.message);
    }
  }
  return result;
}

// ---------- public API ----------

/**
 * Send to ONE user object (must include fcm_token, hms_token, push_provider).
 * Resolves to { sent: boolean, provider: 'fcm'|'hms'|null }.
 */
export async function sendToUser(user, payload) {
  try {
    const target = pickTarget(user);
    if (!target) return { sent: false, provider: null };

    if (target.provider === 'hms') {
      const res = await sendHmsToTokens([target.token], payload);
      if (res.invalidTokens.length) await clearInvalidHmsTokens(res.invalidTokens);
      if (res.errors.length) console.error('⚠️ [push] HMS send issue:', JSON.stringify(res.errors));
      return { sent: res.success > 0, provider: 'hms' };
    }

    const res = await sendFcmToTokens([target.token], payload);
    return { sent: res.success > 0, provider: 'fcm' };
  } catch (err) {
    console.error('⚠️ [push] sendToUser error:', err.message);
    return { sent: false, provider: null };
  }
}

/**
 * Send to MANY user objects. Groups by provider, de-duplicates tokens.
 * Resolves to { fcm: {success, failure}, hms: {success, failure} }.
 */
export async function sendToUsers(users, payload) {
  const summary = { fcm: { success: 0, failure: 0 }, hms: { success: 0, failure: 0 } };
  try {
    const fcmTokens = [];
    const hmsTokens = [];
    for (const user of users || []) {
      const target = pickTarget(user);
      if (!target) continue;
      (target.provider === 'hms' ? hmsTokens : fcmTokens).push(target.token);
    }

    const [fcmRes, hmsRes] = await Promise.allSettled([
      sendFcmToTokens(fcmTokens, payload),
      sendHmsToTokens(hmsTokens, payload)
    ]);

    if (fcmRes.status === 'fulfilled') summary.fcm = fcmRes.value;

    if (hmsRes.status === 'fulfilled') {
      summary.hms = { success: hmsRes.value.success, failure: hmsRes.value.failure };
      if (hmsRes.value.invalidTokens.length) await clearInvalidHmsTokens(hmsRes.value.invalidTokens);
      if (hmsRes.value.errors.length) console.error('⚠️ [push] HMS send issue:', JSON.stringify(hmsRes.value.errors));
    }
  } catch (err) {
    console.error('⚠️ [push] sendToUsers error:', err.message);
  }
  return summary;
}

/**
 * Send to a topic on BOTH networks (e.g. 'subject_5', 'course_3', 'all_users').
 * Resolves to { fcm: boolean, hms: boolean | null }  (hms null = not configured).
 */
export async function sendToTopic(topic, payload) {
  const out = { fcm: false, hms: isHmsConfigured() ? false : null };
  try {
    const tasks = [
      admin.messaging().send({ ...buildFcmMessage(payload), topic })
    ];
    if (isHmsConfigured()) tasks.push(sendHmsToTopic(topic, payload));

    const [fcmRes, hmsRes] = await Promise.allSettled(tasks);

    out.fcm = fcmRes.status === 'fulfilled';
    if (!out.fcm) console.error(`⚠️ [push] FCM topic "${topic}" error:`, fcmRes.reason?.message);

    if (hmsRes) {
      out.hms = hmsRes.status === 'fulfilled' && hmsRes.value.success === true;
      if (!out.hms) {
        const why = hmsRes.status === 'fulfilled'
          ? `${hmsRes.value.code} ${hmsRes.value.msg || ''}`
          : hmsRes.reason?.message;
        console.error(`⚠️ [push] HMS topic "${topic}" error:`, why);
      }
    }
  } catch (err) {
    console.error('⚠️ [push] sendToTopic error:', err.message);
  }
  return out;
}

/**
 * Same as sendToTopic, but THROWS when the message reached neither network.
 * Use it where the old code relied on `admin.messaging().send()` throwing
 * (cron jobs / webhooks that must not mark work as "done" after a failed send).
 */
export async function sendToTopicOrThrow(topic, payload) {
  const result = await sendToTopic(topic, payload);
  if (!result.fcm && !result.hms) {
    throw new Error(`Push to topic "${topic}" failed on all networks`);
  }
  return result;
}
