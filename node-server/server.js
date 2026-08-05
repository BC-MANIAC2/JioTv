import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { env } from './src/env.js';
import { getConfig } from './src/config.js';
import { handleLive } from './src/live.js';
import { handleWanda } from './src/wanda.js';
import { sendOTP, verifyOTP } from './src/auth.js';
import { jioFetch } from './src/jio.js';
import { decodeApiUrl } from './src/config.js';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static frontend files
app.use(express.static('public'));

// Helper to extract sessionData from Express req
function getSessionData(req) {
  const customHeader = req.headers['x-jiotv-sess'];
  if (customHeader) {
    try {
      return JSON.parse(customHeader);
    } catch (e) {}
  }
  
  // Fallback to cookie for legacy support if needed
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/jiotv_sess=([^;]+)/);
  if (match) {
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch (e) {}
  }
  return null;
}

// Helper to create a mock Web Request object for the handlers
function createMockRequest(req) {
  return {
    headers: {
      get: (name) => req.headers[name.toLowerCase()] || null
    }
  };
}

// Helper to send a Web Response object via Express res
async function sendWebResponse(res, webResponse) {
  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  
  if (webResponse.body) {
    const arrayBuffer = await webResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } else {
    res.end();
  }
}

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

app.get('/api/channels', async (req, res) => {
  try {
    const response = await fetch('https://gist.githubusercontent.com/Jitendraunatti/81dba71a35bea9d947f911fd5ef998f0/raw/jiotv.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error("Error fetching channels:", e);
    res.status(500).json({ error: "Failed to load channels" });
  }
});

app.get('/play.php', (req, res) => {
  const id = req.query.id;
  const name = req.query.name || 'JioTV';
  // Redirect to the new Vue/Vanilla frontend player
  res.redirect(`/play.html?id=${id}&name=${encodeURIComponent(name)}`);
});

app.get('/live.m3u8', async (req, res) => {
  const sessionData = getSessionData(req);
  const config = await getConfig(env);
  const id = req.query.id;
  
  if (req.query.token !== 'JITENDRA_KUMAR') {
    return res.status(403).send('Invalid token');
  }

  const mockReq = createMockRequest(req);
  const response = await handleLive(id, sessionData, config, baseUrl, env, mockReq);
  await sendWebResponse(res, response);
});

app.get('/wanda.php', async (req, res) => {
  const sessionData = getSessionData(req);
  const config = await getConfig(env);
  if (req.query.token !== 'JITENDRA_KUMAR') return res.status(403).send('Invalid token');

  // Convert Express query to URLSearchParams for wanda.js compatibility
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    params.set(key, value);
  }
  
  const mockReq = createMockRequest(req);
  const response = await handleWanda({ url: baseUrl + req.url }, sessionData, config, baseUrl, mockReq, env);
  await sendWebResponse(res, response);
});

// Stream resolver: Determines the best stream source (Teachub or Native) and returns JSON
app.get('/api/stream', async (req, res) => {
  const id = req.query.id;
  const sessionData = getSessionData(req);
  console.log(`[DEBUG] /api/stream requested for id=${id}. SessionData exists: ${!!sessionData}`);
  const config = await getConfig(env);
  if (!id) return res.status(400).json({ error: 'Missing channel ID' });
  if (req.query.token !== 'JITENDRA_KUMAR') return res.status(403).json({ error: 'Invalid token' });

  // If user is logged in with Jio, fetch stream URL directly
  if (sessionData && sessionData.authToken) {
    try {
      // Lazy load dependencies to avoid circular imports if any
      const { jioFetch } = await import('./src/jio.js');
      const { decodeApiUrl } = await import('./src/config.js');
      
      const sv = config.api_endpoint_static_value ?? {};
      const user = sessionData.sessionAttributes?.user ?? {};
      
      const headers = [
        'User-Agent: '    + (sv['User-Agent-OkHttp'] || ''),
        'Content-Type: application/x-www-form-urlencoded',
        'appkey: '        + (sv.appkey || ''),
        'devicetype: '    + (sv.deviceType || ''),
        'os: '            + (sv.os || ''),
        'deviceid: '      + (sessionData.deviceId || ''),
        'versionCode: '   + (sv.versionCode || ''),
        'osversion: '     + (sv.osversion || ''),
        'dm: '            + (sv.dm || ''),
        'x-platform: '   + (sv['x-platform'] || ''),
        'uniqueid: '      + (user.unique || ''),
        'usergroup: '     + (sv.usergroup || ''),
        'languageid: 6',
        'userid: ril'     + (user.subscriberId || ''),
        'sid: '           + (sessionData.analyticsId || ''),
        'crmid: '         + (user.subscriberId || ''),
        'isott: '         + (sv.isott || ''),
        'channel_id: '    + id,
        'accesstoken: '   + sessionData.authToken,
        'ssotoken: '      + (sessionData.ssoToken || ''),
        'subscriberid: '  + (user.subscriberId || ''),
        'lbcookie: 1'
      ];

      const getUrl = decodeApiUrl(config.jiotv_api?.geturl);
      const body = `stream_type=Seek&channel_id=${id}`;
      
      const result = await jioFetch(getUrl, headers, 'POST', body);
      let json = {};
      try { json = JSON.parse(result.data); } catch {}
      console.log(`[API STREAM] json response for ${id}:`, JSON.stringify(json).substring(0, 300));
      
      if (json.code === 200 && json.result) {
        let streamUrl = json.result;
        const isDash = streamUrl.includes('.mpd');

        // JioTV sometimes returns a stale index.m3u8 that returns 404 on the CDN.
        // We must fallback to high/medium/low directly if index.m3u8 is dead.
        if (streamUrl.includes('.m3u8') && json.bitrates) {
          const candidates = [streamUrl, json.bitrates.high, json.bitrates.medium, json.bitrates.low].filter(Boolean);
          console.log(`[API STREAM] Checking candidates for ${id}:`, candidates.length);
          for (const cand of candidates) {
            try {
              // The API already includes the __hdnea__ token in these URLs, so we can just HEAD them
              const check = await fetch(cand, { method: 'HEAD' });
              console.log(`[API STREAM] Candidate ${cand.split('?')[0]} returned ${check.status}`);
              if (check.status !== 404) {
                streamUrl = cand;
                break;
              }
            } catch (e) {
              console.log(`[API STREAM] Candidate check failed for ${cand.split('?')[0]}:`, e.message);
            }
          }
        }

        // Proxy the stream URL through our generic proxy to bypass CORS
        return res.json({
          type: isDash ? 'dash' : 'hls',
          url: `/proxy/${streamUrl}`
        });
      } else {
        console.error("Native stream fetch returned non-200:", result.info.http_code, json);
      }
    } catch (err) {
      console.error("Native stream fetch error:", err);
      // Fallback to teachub if native fails
    }
  }

  // Fallback to Teachub Proxy for free users (only supports HLS)
  res.json({
    type: 'hls',
    url: `/live.m3u8?id=${id}&token=JITENDRA_KUMAR&_t=${Date.now()}`
  });
});

// Generic proxy for DASH (.mpd) and segments (.m4s) when logged in natively
app.use('/proxy', async (req, res) => {
  let targetUrl = req.url.substring(1);
  if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
    targetUrl = targetUrl.replace('https:/', 'https://');
  } else if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
    targetUrl = targetUrl.replace('http:/', 'http://');
  }
  // req.url contains the full query string already, so we don't need to append it again.
  // express's req.url is the path + query string of the matched sub-route.
  
  console.log(`[PROXY] Fetching: ${targetUrl}`);
  if (!targetUrl || !targetUrl.startsWith('http')) return res.status(400).send('Missing url');

  const fetchHeaders = {
    'User-Agent': 'ExoPlayerLoader', // Standard Android Player UA
    'Accept': '*/*'
  };

  // Stop stripping query string and cookie - let it forward exactly like jiotv_go
  // if (targetUrl.includes('tv.media.jio.com') && targetUrl.includes('?')) {
  //   targetUrl = targetUrl.split('?')[0];
  // }

  const sessionData = getSessionData(req);
  const channelId = req.headers['x-jiotv-channelid'] || '100';

  if (sessionData && targetUrl.includes('jio.com')) {
    const user = sessionData.sessionAttributes?.user ?? {};
    // Match jiotv_go EXACT headers for key fetches
    fetchHeaders['Content-type'] = 'application/x-www-form-urlencoded';
    fetchHeaders['appkey'] = 'NzNiMDhlYzQyNjJm';
    fetchHeaders['channelId'] = channelId;
    fetchHeaders['channel_id'] = channelId;
    fetchHeaders['crmid'] = user.subscriberId || '';
    fetchHeaders['userId'] = user.subscriberId || '';
    fetchHeaders['deviceId'] = sessionData.deviceId || '300653d8650a2';
    fetchHeaders['devicetype'] = 'phone';
    fetchHeaders['isott'] = 'false';
    fetchHeaders['languageId'] = '6';
    fetchHeaders['lbcookie'] = '1';
    fetchHeaders['os'] = 'android';
    fetchHeaders['osVersion'] = '13';
    fetchHeaders['srno'] = '230203144000';
    fetchHeaders['ssotoken'] = sessionData.ssoToken || '';
    fetchHeaders['subscriberId'] = user.subscriberId || '';
    fetchHeaders['uniqueId'] = user.unique || '';
    fetchHeaders['usergroup'] = 'tvYR7NSNn7rymo3F';
    fetchHeaders['versionCode'] = '331'; // jiotv_go uses 389 but 331 is fine
  }

  // Debug log the exact fetch we are making for keys
  if (targetUrl.includes('.key') || targetUrl.includes('.pkey')) {
    console.log(`[KEY PROXY] Fetching key for channel ${channelId}`);
  }

  try {
    const response = await fetch(targetUrl, {
      headers: fetchHeaders,
      redirect: 'follow'
    });
    if (targetUrl.includes('.key') || targetUrl.includes('.pkey')) {
      console.log(`[KEY PROXY] Response status: ${response.status}`);
      if (!response.ok) {
        const text = await response.text();
        console.log(`[KEY PROXY] Error text: ${text.substring(0, 200)}`);
        return res.status(response.status).send(text);
      }
    }
    
    res.status(response.status);
    response.headers.forEach((val, key) => res.setHeader(key, val));
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (response.body) {
      // Pipe stream
      for await (const chunk of response.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});

// Widevine DRM License Proxy
app.post('/wanda_drm.php', async (req, res) => {
  const sessionData = getSessionData(req);
  if (!sessionData || !sessionData.authToken) return res.status(401).send('Not logged in');
  
  const config = await getConfig(env);
  const user = sessionData.sessionAttributes?.user ?? {};
  const sv = config.api_endpoint_static_value ?? {};
  
  // Read binary challenge from request body
  const challengeBuffer = await new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const headers = [
    'User-Agent: ' + (sv['User-Agent-OkHttp'] || ''),
    'Content-Type: application/octet-stream',
    'appkey: ' + (sv.appkey || ''),
    'devicetype: ' + (sv.deviceType || ''),
    'os: ' + (sv.os || ''),
    'deviceid: ' + (sessionData.deviceId || ''),
    'uniqueid: ' + (user.unique || ''),
    'accesstoken: ' + sessionData.authToken,
    'ssotoken: ' + (sessionData.ssoToken || '')
  ];

  // The DRM endpoint is usually hardcoded or in config. Let's use the standard one.
  const drmUrl = 'https://tv.media.jio.com/apis/v1.4/getdrmkey/getdrmkey';
  
  try {
    const result = await jioFetch(drmUrl, headers, 'POST', challengeBuffer);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.status(result.info.http_code).send(Buffer.from(result.dataBuffer));
  } catch (e) {
    res.status(500).send('DRM proxy error');
  }
});

// Login endpoints
app.post('/api/login/send-otp', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ message: 'Number is required' });
    const config = await getConfig(env);
    const result = await sendOTP(number, config, env);
    res.json(result);
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/login/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'OTP required' });
    const config = await getConfig(env);
    const result = await verifyOTP(otp, config, env);
    
    if (result && result.sessionData) {
      // Set cookie that the frontend will send on subsequent requests
      const cookieVal = encodeURIComponent(JSON.stringify(result.sessionData));
      res.cookie('jiotv_sess', cookieVal, { maxAge: 90000000, httpOnly: false });
    }
    res.json(result || { message: 'Unknown error' });
  } catch (err) {
    console.error("verify-otp error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
