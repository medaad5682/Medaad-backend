// lib/pushRegistration.js
// ------------------------------------------------------------------
// Reads the push-token headers sent by the app and turns them into the
// column updates for the `users` table.
//
// Headers:
//   x-push-provider : 'fcm' | 'hms'      (new apps)
//   x-push-token    : the device token   (new apps)
//   x-fcm-token     : FCM token          (OLD apps - still supported)
//
// A user keeps ONE provider only: saving one token clears the other.
// ------------------------------------------------------------------

const MAX_TOKEN_LENGTH = 4096;
const VALID_PROVIDERS = ['fcm', 'hms'];

function cleanToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

/**
 * @param {object} headers  req.headers
 * @returns {object|null}   columns to update, or null when no token was sent
 */
export function buildPushTokenUpdate(headers) {
  const provider = String(headers['x-push-provider'] || '').trim().toLowerCase();
  const pushToken = cleanToken(headers['x-push-token']);

  // New apps
  if (pushToken && VALID_PROVIDERS.includes(provider)) {
    return provider === 'hms'
      ? { hms_token: pushToken, push_provider: 'hms', fcm_token: null }
      : { fcm_token: pushToken, push_provider: 'fcm', hms_token: null };
  }

  // Old apps (FCM only)
  const legacyFcmToken = cleanToken(headers['x-fcm-token']);
  if (legacyFcmToken) {
    return { fcm_token: legacyFcmToken, push_provider: 'fcm', hms_token: null };
  }

  return null;
}

// Used on logout: the device must stop receiving this user's notifications.
export const CLEAR_PUSH_TOKENS = { fcm_token: null, hms_token: null };
