// ============================================================
// JioTV Cloudflare Worker — Main Router
// Indian Edge IP via Cloudflare Mumbai/Chennai PoPs
// Free forever, no device needed, always online
//
// Routes:
//   GET  /             → Channel listing (requires auth)
//   GET  /login        → Login page
//   POST /api/otpsend  → Send OTP
//   POST /api/otpverify → Verify OTP
//   POST /logout       → Clear session
//   GET  /live.m3u8    → Stream URL + rewritten M3U8
//   GET  /wanda.php    → HLS segment proxy
//   GET  /playlist.php → M3U8 playlist for IPTV apps
//   GET  /play.php     → Video player
//   POST /api          → Legacy action-based handler
// ============================================================

import { getConfig }                              from './config.js';
import { getSession, createSession, deleteSession,
         buildSetCookie, buildClearCookie }       from './session.js';
import { sendOTP, verifyOTP, getChannels }        from './auth.js';
import { handleLive }                             from './live.js';
import { handleWanda }                            from './wanda.js';
import { generatePlaylist }                       from './playlist.js';
import { loginPage, channelPage,
         playerPage, errorPage }                  from './pages.js';

// ── Token constant ──────────────────────────────────────────
function hexToStr(h) { let s=''; for(let i=0;i<h.length;i+=2) s+=String.fromCharCode(parseInt(h.slice(i,i+2),16)); return s; }
const JIOTV_TOKEN = atob(hexToStr('536b6c5552553545556b46665331564e5156493d'));

// ── CORS headers for API responses ─────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra }
  });
}

function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', ...extra }
  });
}

function redirect(url, baseUrl, status = 302) {
  const absoluteUrl = url.startsWith('/') ? new URL(url, baseUrl).toString() : url;
  return Response.redirect(absoluteUrl, status);
}

// ── Main request handler ────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;
    const baseUrl  = url.origin; // e.g. https://jiotv.myname.workers.dev

    // Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Config (shared across all routes) ────────────────
    let config;
    try {
      config = await getConfig(env);
    } catch (e) {
      console.error('Config error:', e);
      return html(errorPage('Config Error', 'Could not load JioTV configuration. Please try again later.'));
    }

    // ── Public routes (no auth needed) ──────────────────

    // Login page
    if (pathname === '/login' && method === 'GET') {
      return html(loginPage(config));
    }

    // OTP send
    if (pathname === '/api/otpsend' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const { number } = body;
      if (!number || !/^[6-9]\d{9}$/.test(String(number).trim())) {
        return json({ message: 'INVALID', ui_label: 'Enter a valid 10-digit mobile number ❌' }, 400);
      }
      const result = await sendOTP(String(number).trim(), config, env);
      return json(result);
    }

    // OTP verify
    if (pathname === '/api/otpverify' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const { otp } = body;
      if (!otp || !/^\d{4,6}$/.test(String(otp).trim())) {
        return json({ message: 'INVALID', ui_label: 'Enter the OTP ❌' }, 400);
      }
      const result = await verifyOTP(String(otp).trim(), config, env);

      if (result.message === 'SUCCESS') {
        const sessionId = await createSession(result.sessionData, env);
        return json(
          { message: 'SUCCESS', ui_label: result.ui_label },
          200,
          { 'Set-Cookie': buildSetCookie(sessionId) }
        );
      }
      return json(result);
    }

    // Logout
    if (pathname === '/logout' && method === 'POST') {
      const session = await getSession(request, env);
      await deleteSession(request, env);
      return json({ ok: true }, 200, { 'Set-Cookie': buildClearCookie() });
    }

    // ── Auth check for all remaining routes ──────────────
    const session = await getSession(request, env);

    if (!session) {
      // API endpoints return JSON error
      if (pathname.startsWith('/api/') || pathname.startsWith('/live') ||
          pathname.startsWith('/wanda') || pathname.startsWith('/playlist')) {
        return json({ error: 'Not authenticated', redirect: '/login' }, 401);
      }
      // Pages redirect to login
      return redirect('/login', baseUrl);
    }

    // ── Authenticated routes ─────────────────────────────

    // Main channel listing
    if ((pathname === '/' || pathname === '/index.php') && method === 'GET') {
      const channels = await getChannels(config, env);
      return html(channelPage(config, channels));
    }

    // Login page redirect (already logged in)
    if (pathname === '/login' && method === 'GET') {
      return redirect('/', baseUrl);
    }

    // Video player
    if ((pathname === '/play.php' || pathname === '/play') && method === 'GET') {
      const channelId   = url.searchParams.get('id')   || '';
      const channelName = url.searchParams.get('name') || url.searchParams.get('cid') || 'Channel';
      const logoUrl     = url.searchParams.get('cid')  || '';
      const decodedName = decodeURIComponent(channelName);
      return html(playerPage(channelId, decodedName, logoUrl, config));
    }

    // Live M3U8 stream
    if ((pathname === '/live.php' || pathname === '/live.m3u8') && method === 'GET') {
      const channelId = url.searchParams.get('id') || '';
      const token     = url.searchParams.get('token') || '';

      // Token validation (same security check as PHP)
      if (token !== JIOTV_TOKEN && !session) {
        return new Response('#EXTM3U\n# Unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
        });
      }

      return await handleLive(channelId, session, config, baseUrl, env);
    }

    // HLS segment proxy
    if (pathname === '/wanda.php' && method === 'GET') {
      return await handleWanda(request, session, config, baseUrl);
    }

    // M3U8 playlist (for TiviMate, VLC, etc.)
    if (pathname === '/playlist.php' && method === 'GET') {
      return await generatePlaylist(config, baseUrl, env);
    }

    // ── Legacy POST /api handler (matches original PHP) ──
    if (pathname === '/api' || pathname === '/jitendraunatti.php') {
      if (method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch {}
        const action = body.action || '';

        if (action === 'livechannels') {
          const data = await getChannels(config, env);
          return json(data);
        }

        if (action === 'otpsend') {
          const { number } = body;
          const result = await sendOTP(String(number || '').trim(), config, env);
          return json(result);
        }

        if (action === 'otpverify') {
          const { otp } = body;
          const result = await verifyOTP(String(otp || '').trim(), config, env);
          if (result.message === 'SUCCESS') {
            const sessionId = await createSession(result.sessionData, env);
            return json(
              { message: 'SUCCESS', ui_label: result.ui_label },
              200,
              { 'Set-Cookie': buildSetCookie(sessionId) }
            );
          }
          return json(result);
        }

        return json({ error: 'Unknown action' }, 400);
      }

      // GET /jitendraunatti.php → redirect to channel listing
      if (method === 'GET') {
        return redirect('/');
      }
    }

    // ── 404 ─────────────────────────────────────────────
    return html(errorPage('404 Not Found', `No route for ${pathname}`, '/', 'Home'), 404);
  }
};
