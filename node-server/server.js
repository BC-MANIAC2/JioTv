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

// Login endpoints
// OTP and Login routes removed as they are no longer required.

// Remove the basic old HTML routes since we now serve static files from public/

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
