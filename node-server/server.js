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

// Helper to extract sessionData from Express req cookies string
function getSessionData(req) {
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
  const sessionData = getSessionData(req);
  const config = await getConfig(env);
  const id = req.query.id;
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
      
      if (json.code === 200 && json.result) {
        const streamUrl = json.result;
        const isDash = streamUrl.includes('.mpd');
        // Proxy the stream URL through our generic proxy to bypass CORS
        return res.json({
          type: isDash ? 'dash' : 'hls',
          url: `/proxy?url=${encodeURIComponent(streamUrl)}`
        });
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
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'ExoPlayerLoader', // Standard Android Player UA
        'Accept': '*/*'
      }
    });
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
  const { number } = req.body;
  if (!number) return res.status(400).json({ message: 'Number is required' });
  const config = await getConfig(env);
  const result = await sendOTP(number, config, env);
  res.json(result);
});

app.post('/api/login/verify-otp', async (req, res) => {
  const { number, otp } = req.body;
  if (!number || !otp) return res.status(400).json({ message: 'Number and OTP required' });
  const config = await getConfig(env);
  const result = await verifyOTP(number, otp, config, env);
  
  if (result.sessionData) {
    // Set cookie that the frontend will send on subsequent requests
    const cookieVal = encodeURIComponent(JSON.stringify(result.sessionData));
    res.cookie('jiotv_sess', cookieVal, { maxAge: 90000000, httpOnly: false });
  }
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
