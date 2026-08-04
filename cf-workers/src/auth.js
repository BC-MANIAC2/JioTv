// ============================================================
// Authentication — OTP send/verify and token management
// Mirrors PHP: jiotv_otp_send(), jio_tv_login(), jio_tv_refreshtoken_generate()
// ============================================================

import { jioFetch } from './jio.js';
import { decodeApiUrl } from './config.js';

// Generate a random device ID (16 hex chars like PHP's substr(sha1(...), 0, 16))
function makeDeviceId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── OTP SEND ─────────────────────────────────────────────────
// Mirrors PHP jiotv_otp_send($mobile_no)
export async function sendOTP(mobile, config, env) {
  const body = JSON.stringify({ number: btoa('+91' + mobile) });

  const headers = [
    'User-Agent: '  + (config.api_endpoint_static_value?.['User-Agent-OkHttp'] || ''),
    'appname: '     + (config.api_endpoint_static_value?.appName || ''),
    'os: '          + (config.api_endpoint_static_value?.os || ''),
    'm-rating: '    + (config.api_endpoint_static_value?.['m-rating'] || ''),
    'devicetype: '  + (config.api_endpoint_static_value?.deviceType || ''),
    'content-type: application/json; charset=utf-8',
  ];

  const url = decodeApiUrl(config.jiotv_api?.send);
  const result = await jioFetch(url, headers, 'POST', body);

  if (result.info.http_code === 204) {
    // Store pending mobile in KV (10 min TTL)
    await env.KV.put('otp_mobile', mobile, { expirationTtl: 600 });
    return { message: 'SUCCESS', ui_label: 'OTP Sent Successfully ✅' };
  }

  let json = {};
  try { json = JSON.parse(result.data); } catch {}

  const code = json.code ?? 0;
  const errorMap = {
    1042: { message: 'INVALID_SESSION', ui_label: 'Session expired, please refresh ❌' },
    1002: { message: 'USER_NOT_FOUND',  ui_label: 'Number not registered with Jio ❌' },
    1040: { message: 'RATE_LIMIT',      ui_label: 'Too many attempts. Wait 15 minutes ❌' },
  };
  return errorMap[code] ?? {
    message: 'API_ERROR',
    ui_label: (json.message ?? 'Connection error') + ' ❌'
  };
}

// ── EXPIRE ALL USERS (device limit handling) ─────────────────
// Mirrors PHP expireallusers($temp_token, $DEVICE_ID)
async function expireAllUsers(tempToken, deviceId, config) {
  const body = JSON.stringify({
    appName: config.api_endpoint_static_value?.appName || '',
    deviceId,
  });
  const headers = [
    'User-Agent: '  + (config.api_endpoint_static_value?.['User-Agent-OkHttp'] || ''),
    'x-platform: '  + (config.api_endpoint_static_value?.['x-platform'] || ''),
    'temptoken: '   + tempToken,
    'content-type: application/json; charset=utf-8',
  ];
  const url = decodeApiUrl(config.jiotv_api?.expireallusers);
  const result = await jioFetch(url, headers, 'POST', body);
  try { return JSON.parse(result.data); } catch { return null; }
}

// ── OTP VERIFY / LOGIN ────────────────────────────────────────
// Mirrors PHP jio_tv_login($OTP)
export async function verifyOTP(otp, config, env) {
  const mobile = await env.KV.get('otp_mobile');
  if (!mobile) {
    return { message: 'EXPIRED', ui_label: 'Session expired. Please re-enter your number ❌' };
  }

  const deviceId = makeDeviceId();
  const body = JSON.stringify({
    number: btoa('+91' + mobile),
    otp,
    deviceInfo: {
      consumptionDeviceName: config.api_endpoint_static_value?.devicename || 'JioTV',
      info: {
        type: config.api_endpoint_static_value?.os || 'android',
        platform: { name: config.api_endpoint_static_value?.['p-Name'] || 'Android' },
        androidId: deviceId,
      }
    }
  });

  const headers = [
    'User-Agent: '  + (config.api_endpoint_static_value?.['User-Agent-OkHttp'] || ''),
    'appname: '     + (config.api_endpoint_static_value?.appName || ''),
    'os: '          + (config.api_endpoint_static_value?.os || ''),
    'devicetype: '  + (config.api_endpoint_static_value?.deviceType || ''),
    'content-type: application/json; charset=utf-8',
  ];

  const url = decodeApiUrl(config.jiotv_api?.verify);
  const result = await jioFetch(url, headers, 'POST', body);

  let json = {};
  try { json = JSON.parse(result.data); } catch {}

  // Handle device limit scenario
  if (json.code === 200 && json.data?.tempToken && !json.data?.authToken) {
    const targetDeviceId = json.data.deviceId ?? deviceId;
    const newTokens = await expireAllUsers(json.data.tempToken, targetDeviceId, config);
    if (newTokens?.data?.authToken) {
      json.data.authToken    = newTokens.data.authToken;
      json.data.refreshToken = newTokens.data.refreshToken;
      json.data.ssoToken     = newTokens.data.ssoToken;
    }
  }

  if (json.code === 200 && json.data?.authToken) {
    await env.KV.delete('otp_mobile');
    return {
      message: 'SUCCESS',
      ui_label: 'Logged in Successfully ✅',
      sessionData: { ...json.data, deviceId: json.data.deviceId || deviceId },
    };
  }

  if (json.code === 1043) {
    return { message: 'INVALID_OTP', ui_label: 'Incorrect OTP ❌' };
  }

  return { message: 'AUTH_ERROR', ui_label: (json.message ?? 'Verification failed') + ' ❌' };
}

// ── TOKEN REFRESH ─────────────────────────────────────────────
// Mirrors PHP jio_tv_refreshtoken_generate()
// Returns a valid auth token (from cache if still fresh, or refreshed)
export async function getValidToken(sessionData, config) {
  // Check current token expiry (keep if >1 hour left)
  const currentToken = sessionData?.authToken;
  if (currentToken) {
    try {
      const parts = currentToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp > (Date.now() / 1000 + 3600)) {
          return currentToken; // Still valid
        }
      }
    } catch {}
  }

  // Refresh the token
  const body = JSON.stringify({
    appName:      config.api_endpoint_static_value?.appName || '',
    deviceId:     sessionData?.deviceId || '',
    refreshToken: sessionData?.refreshToken || '',
  });

  const headers = [
    'User-Agent: '  + (config.api_endpoint_static_value?.['User-Agent-OkHttp'] || ''),
    'accesstoken: ' + (currentToken || ''),
    'devicetype: '  + (config.api_endpoint_static_value?.deviceType || ''),
    'versionCode: ' + (config.api_endpoint_static_value?.versionCode || ''),
    'os: '          + (config.api_endpoint_static_value?.os || ''),
    'uniqueid: '    + (sessionData?.sessionAttributes?.user?.unique || ''),
    'content-type: application/json; charset=utf-8',
  ];

  const url = decodeApiUrl(config.jiotv_api?.refreshtoken);
  const result = await jioFetch(url, headers, 'POST', body);

  let json = {};
  try { json = JSON.parse(result.data); } catch {}

  if (json.code === 200 && json.data?.authToken) {
    // Update session data with new tokens
    sessionData.authToken    = json.data.authToken;
    sessionData.refreshToken = json.data.refreshToken ?? sessionData.refreshToken;
    return json.data.authToken;
  }

  return currentToken || ''; // Fallback to old token
}

// Fetch channel list from JioTV API
export async function getChannels(config, env) {
  // Check KV cache (24h)
  const cached = await env.KV.get('jiotv_channels', 'json');
  if (cached) return cached;

  const url = config.api_endpoint?.live_channels;
  if (!url) return { result: [] };

  const resp = await fetch(url);
  if (!resp.ok) return { result: [] };

  const data = await resp.json();
  await env.KV.put('jiotv_channels', JSON.stringify(data), { expirationTtl: 86400 });
  return data;
}
