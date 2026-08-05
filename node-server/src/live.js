// ============================================================
// Live Stream Handler
// Mirrors PHP live.php — fetches stream URL from JioTV API,
// then fetches the M3U8 and rewrites all segment/key URLs to
// proxy through our /wanda endpoint.
// ============================================================

// No imports needed for piggybacking

// Build headers for JioTV stream API calls
export function streamHeaders(sessionData, config, channelId, authToken, includeCookie = null, clientIp = null) {
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
  if (!channelId) {
    return errorM3U8('Missing channel ID');
  }

  try {
    // 1. Get or create a session cookie from teachub
    let sessionId = await env.KV.get('teachub_session');
    
    if (!sessionId) {
      const sessionReq = await fetch('https://04jio.teachub.workers.dev/create-session', {
        headers: {
          'Origin': 'https://2p.teachub.workers.dev',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (!sessionReq.ok) {
        console.log('sessionReq failed:', sessionReq.status, await sessionReq.text());
        return errorM3U8(`Proxy session creation failed: ${sessionReq.status}`);
      }
      
      const setCookie = sessionReq.headers.get('set-cookie');
      console.log('setCookie header:', setCookie);
      if (setCookie) {
        // extract sessionId=XXXX;
        const match = setCookie.match(/session=([^;]+)/);
        if (match) {
          sessionId = match[1];
          // Cache the session for 3 hours (10800 seconds)
          await env.KV.put('teachub_session', sessionId, { expirationTtl: 10800 });
        }
      }
    }

    if (!sessionId) {
      return errorM3U8('Could not obtain proxy session ID');
    }

    // 2. Fetch the M3U8 from teachub's live.m3u8 endpoint
    const m3u8Req = await fetch(`https://04jio.teachub.workers.dev/live.m3u8?id=${channelId}`, {
      headers: {
        'Origin': 'https://2p.teachub.workers.dev',
        'Cookie': `session=${sessionId}`,
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!m3u8Req.ok) {
      return errorM3U8(`Proxy stream fetch failed: ${m3u8Req.status}`);
    }

    let m3u8Str = await m3u8Req.text();
    
    if (m3u8Str.includes('Unauthorized')) {
      // Session expired, clear cache and try again next time
      await env.KV.delete('teachub_session');
      return errorM3U8('Proxy session expired, please refresh the page');
    }

    if (!m3u8Str.includes('#EXTM3U')) {
      console.log('Invalid M3U8 received from Teachub:', m3u8Str.substring(0, 100));
      return errorM3U8('Channel currently unavailable (Upstream DRM or 404 Error)');
    }

    // 3. Rewrite wanda.php to our own backend (using relative path to avoid localhost issues)
    // Teachub returns either `wanda.php?...` or `https://2p.teachub.../wanda.php?...`
    m3u8Str = m3u8Str.replace(/(^|\n|\r|URI=")(?:https?:\/\/[^\/]+)?\/?wanda\.php\?/g, `$1/wanda.php?`);

    return new Response(m3u8Str.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store'
      }
    });
    
  } catch (err) {
    console.error('Teachub Proxy Error:', err);
    return errorM3U8(`Proxy error: ${err.message}`);
  }
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

