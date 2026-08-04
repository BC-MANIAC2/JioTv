// ============================================================
// Live Stream Handler
// Mirrors PHP live.php — fetches stream URL from JioTV API,
// then fetches the M3U8 and rewrites all segment/key URLs to
// proxy through our /wanda endpoint.
// ============================================================

import { jioFetch } from './jio.js';
import { decodeApiUrl } from './config.js';
import { getValidToken } from './auth.js';
import { encrypt } from './crypto.js';

// The validation token JioTV uses — same as PHP's hex-decoded value
function hexToStr(hex) {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i+2), 16));
  return s;
}
const JIOTV_TOKEN = atob(hexToStr('536b6c5552553545556b46665331564e5156493d'));

// Build headers for JioTV stream API calls
function streamHeaders(sessionData, config, channelId, authToken, includeCookie = null, clientIp = null) {
  const sv = config.api_endpoint_static_value ?? {};
  const user = sessionData?.sessionAttributes?.user ?? {};
  const headers = [
    'User-Agent: '    + (sv['user-agent'] || sv['User-Agent-OkHttp'] || ''),
    'appkey: '        + (sv.appkey || ''),
    'devicetype: '    + (sv.deviceType || ''),
    'os: '            + (sv.os || ''),
    'deviceid: '      + (sessionData?.deviceId || ''),
    'versionCode: '   + (sv.versionCode || ''),
    'osversion: '     + (sv.osversion || ''),
    'dm: '            + (sv.dm || ''),
    'x-platform: '   + (sv['x-platform'] || ''),
    'uniqueid: '      + (user.unique || ''),
    'usergroup: '     + (sv.usergroup || ''),
    'languageid: 6',
    'userid: ril'     + (user.subscriberId || ''),
    'sid: '           + (sessionData?.analyticsId || ''),
    'crmid: '         + (user.subscriberId || ''),
    'isott: '         + (sv.isott || ''),
    'channelid: '     + channelId,
    'langid: ',
    'camid: ',
    'appName: '       + (sv.appName || ''),
    'srno: '          + new Date().toISOString().replace(/\D/g,'').slice(2,16),
    'accesstoken: '   + authToken,
    'ssotoken: '      + (sessionData?.ssoToken || ''),
    'subscriberid: '  + (user.subscriberId || ''),
    'lbcookie: 1',
    'priority: u=1',
  ];
  if (includeCookie) headers.push('cookie: ' + includeCookie);
  if (clientIp) headers.push('X-Forwarded-For: ' + clientIp);
  return headers.filter(h => h.trim() && !h.endsWith(': '));
}

// Main handler: GET /live.m3u8?id=CHANNEL_ID&token=TOKEN
export async function handleLive(channelId, sessionData, config, baseUrl, env, request) {
  if (!channelId || !sessionData) {
    return errorM3U8('Missing channel ID or not logged in');
  }

  // Validate token param (same security check as PHP)
  // (Already validated in router)

  let streamUrl = null;

  // Check stream URL cache
  const cacheKey = `stream_${channelId}`;
  if (config.JITENDRA_UNIVERSE?.live_cache) {
    try {
      const cached = await env.KV.get(cacheKey, 'json');
      if (cached?.result) {
        const expMatch = cached.result.match(/~exp=(\d+)/);
        if (expMatch && parseInt(expMatch[1]) > Date.now() / 1000 + 30) {
          streamUrl = cached.result;
        }
      }
    } catch {}
  }

  if (!streamUrl) {
    // Fetch new stream URL from JioTV API
    const authToken = await getValidToken(sessionData, config);
    const user = sessionData?.sessionAttributes?.user ?? {};
    const sv   = config.api_endpoint_static_value ?? {};

    const body = `stream_type=Seek&channel_id=${channelId}`;
    const headers = [
      'User-Agent: '    + (sv['User-Agent-OkHttp'] || ''),
      'Content-Type: application/x-www-form-urlencoded',
      'appkey: '        + (sv.appkey || ''),
      'devicetype: '    + (sv.deviceType || ''),
      'os: '            + (sv.os || ''),
      'deviceid: '      + (sessionData?.deviceId || ''),
      'versionCode: '   + (sv.versionCode || ''),
      'osversion: '     + (sv.osversion || ''),
      'dm: '            + (sv.dm || ''),
      'x-platform: '   + (sv['x-platform'] || ''),
      'uniqueid: '      + (user.unique || ''),
      'usergroup: '     + (sv.usergroup || ''),
      'languageid: 6',
      'userid: ril'     + (user.subscriberId || ''),
      'sid: '           + (sessionData?.analyticsId || ''),
      'crmid: '         + (user.subscriberId || ''),
      'isott: '         + (sv.isott || ''),
      'channel_id: '    + channelId,
      'langid: ',
      'camid: ',
      'accesstoken: '   + authToken,
      'ssotoken: '      + (sessionData?.ssoToken || ''),
      'subscriberid: '  + (user.subscriberId || ''),
      'lbcookie: 1',
    ].filter(h => h.trim() && !h.endsWith(': '));

    const clientIp = request?.headers?.get('cf-connecting-ip');
    if (clientIp) {
      headers.push('X-Forwarded-For: ' + clientIp);
    }


    const getUrl = decodeApiUrl(config.jiotv_api?.geturl);
    const result = await jioFetch(getUrl, headers, 'POST', body);

    let json = {};
    try { json = JSON.parse(result.data); } catch {}

    if (json.code !== 200 || !json.result) {
      return errorM3U8(`JioTV API error: ${json.message || result.info.http_code}`);
    }

    streamUrl = json.result;

    // Cache the stream URL
    if (config.JITENDRA_UNIVERSE?.live_cache) {
      try {
        await env.KV.put(cacheKey, JSON.stringify(json), { expirationTtl: 300 });
      } catch {}
    }
  }

  // Fetch the M3U8 manifest with auth headers
  return await fetchAndRewriteM3U8(streamUrl, channelId, sessionData, config, baseUrl, env, request);
}

async function fetchAndRewriteM3U8(streamUrl, channelId, sessionData, config, baseUrl, env, request) {
  const authToken = await getValidToken(sessionData, config);
  const clientIp = request?.headers?.get('cf-connecting-ip') || '';
  const headers = streamHeaders(sessionData, config, channelId, authToken, null, clientIp);

  const result = await jioFetch(streamUrl, headers, 'GET', null);

  if (result.info.http_code !== 200 || (!result.data.includes('#EXTM3U') && !result.data.includes('#EXTINF'))) {
    return new Response(result.data, {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // Extract Set-Cookie from response (used for subsequent segment requests)
  const setCookie = result.responseHeaders['set-cookie'] || '';
  const cookieValue = setCookie.split(';')[0] || '';

  // Base URL for relative segment paths
  const urlObj = new URL(streamUrl);
  const basePath = urlObj.href.replace(/[^/]+$/, ''); // everything up to last /

  // Rewrite M3U8 lines
  const lines = result.data.split('\n');
  const out   = [];
  const thorB64 = encodeURIComponent(btoa(cookieValue));

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(''); continue; }

    if (line.includes('URI="')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const extractedUri = uriMatch[1];
        const absoluteUri = extractedUri.startsWith('http') ? extractedUri : basePath + extractedUri;
        const encUri = await encrypt(absoluteUri);
        const encBase = await encrypt(basePath);

        let param = 'pkey';
        if (line.startsWith('#EXT-X-MEDIA') || extractedUri.includes('.m3u8')) {
          param = 'hls';
        }
        
        let replaceStr = `URI="${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&id=${channelId}&thor=${thorB64}&jane_foster=${encBase}&${param}=${encUri}"`;
        
        const newLine = line.replace(`URI="${extractedUri}"`, replaceStr);
        out.push(newLine);
      } else {
        out.push(line);
      }
    } else if (line.includes('.m3u8') && !line.startsWith('#')) {
      // Sub-playlist
      const encBase = await encrypt(basePath);
      const encFull = await encrypt(basePath + line);
      out.push(`${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&hls=${encFull}`);
    } else if (line.includes('.ts') && !line.startsWith('#')) {
      // TS segment — replace with .jitendraunatti per PHP convention
      const encBase = await encrypt(basePath);
      const encFull = await encrypt(basePath + line);
      const wandaLine = `${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&marvel=${encFull}`;
      out.push(wandaLine.replace('.ts', '.jitendraunatti'));
    } else {
      out.push(raw);
    }
  }

  const devBy = config.JITENDRA_UNIVERSE?.['x-developed-by'] || 'JioTV';
  const tok   = config.JITENDRA_UNIVERSE?.token || '';
  let m3u8 = out.join('\n');
  m3u8 = m3u8.replace('#EXTM3U', `#EXTM3U\n#DEVELOPED_BY_${devBy}\n#AUTHOR-${tok}`);

  return new Response(m3u8.trim(), {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
    }
  });
}

function errorM3U8(msg) {
  return new Response(`#EXTM3U\n# Error: ${msg}`, {
    status: 403,
    headers: { 
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
