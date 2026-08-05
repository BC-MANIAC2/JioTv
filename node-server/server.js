import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { env } from './src/env.js';
import { getConfig } from './src/config.js';
import { handleLive } from './src/live.js';
import { handleWanda } from './src/wanda.js';
import { sendOTP, verifyOTP } from './src/auth.js';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

app.get('/play.php', (req, res) => {
  
  const id = req.query.id;
  const name = req.query.name || 'JioTV';
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${name} | JioTV</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; font-family: sans-serif; }
    video { width: 100%; height: 100%; outline: none; }
    #error-overlay { display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.8); z-index: 10; flex-direction: column; align-items: center; justify-content: center; color: white; }
    #error-overlay.show { display: flex; }
    .error-title { color: #ff4b4b; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .error-msg { font-size: 14px; color: #aaa; margin-bottom: 20px; }
    .btn { background: #1a1a1a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; cursor: pointer; border: 1px solid #333; }
    .btn:hover { background: #333; }
  </style>
</head>
<body>
  <video id="video" controls autoplay></video>
  <div id="error-overlay">
    <div class="error-title">⚠️ Stream Error</div>
    <div class="error-msg" id="error-msg"></div>
    <button class="btn" onclick="location.reload()">Retry</button>
  </div>
  <script>
    const video = document.getElementById('video');
    const streamUrl = '/live.m3u8?id=${id}&token=JITENDRA_KUMAR';
    const SRC = streamUrl + '&_t=' + Date.now();

    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 600 });
      hls.loadSource(SRC);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          document.getElementById('error-msg').textContent = data.details || 'Fatal stream error';
          document.getElementById('error-overlay').classList.add('show');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = SRC;
      video.addEventListener('loadedmetadata', () => video.play().catch(()=>{}));
    } else {
      alert('Your browser does not support HLS playback.');
    }
  </script>
</body>
</html>
  `;
  res.send(html);
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

// Login endpoints
// OTP and Login routes removed as they are no longer required.

app.get('/', (req, res) => {
  res.redirect('/channels.php');
});

app.get('/channels.php', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"><title>Channels | JioTV Proxy</title><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>body { background:#000; color:white; font-family:sans-serif; padding:20px; } a { color:#fff; display:block; margin:10px 0; font-size:18px; text-decoration:none; padding:10px; border:1px solid #333; border-radius:5px; width:200px; text-align:center; background:#111; } a:hover { background:#333; } h2, p { margin-bottom: 20px; }</style>
    </head>
    <body>
      <h2>Welcome to your free JioTV Proxy!</h2>
      <p>✅ Authentication Bypassed</p>
      <p>✅ Akamai CDN Unlocked</p>
      <br/>
      <h2>Channels</h2>
      <a href="/play.php?id=144&name=Colors%20HD">Colors HD</a>
      <a href="/play.php?id=180&name=Asianet%20News">Asianet News</a>
      <a href="/play.php?id=559&name=Pogo%20Hindi">Pogo Hindi</a>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
