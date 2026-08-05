// ============================================================
// HLS Segment Proxy — mirrors PHP wanda.php
// Handles three types of requests:
//   ?hls=ENCRYPTED  → sub-playlist M3U8 (rewrite segments again)
//   ?marvel=ENCRYPTED → .ts video segment (binary passthrough)
//   ?pkey=URL       → encryption key file (binary passthrough)
// ============================================================

import { jioFetch } from './jio.js';
import { encrypt, decrypt } from './crypto.js';
import { getValidToken } from './auth.js';

function hexToStr(hex) {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i,i+2),16));
  return s;
}
const JIOTV_TOKEN = atob(hexToStr('536b6c5552553545556b46665331564e5156493d'));

import { streamHeaders } from './live.js';

export async function handleWanda(request, sessionData, config, baseUrl) {
  const params = new URL(request.url).searchParams;
  const channelId  = params.get('id')         || '';
  const thorB64    = params.get('thor')        || '';
  const janeFoster = params.get('jane_foster') || '';
  const hls        = params.get('hls')         || '';  // sub-playlist
  const marvel     = params.get('marvel')      || '';  // .ts segment
  const pkey       = params.get('pkey')        || '';  // encryption key URL

  const clientIp = request?.headers?.get('cf-connecting-ip') || '';

  let decodedCookie = null;
  if (thorB64) {
    try {
      const thorHex = Buffer.from(thorB64, 'base64').toString('utf8');
      decodedCookie = Buffer.from(thorHex, 'hex').toString('utf8');
    } catch (e) {
      console.error("Cookie decode error in wanda.js:", e);
    }
  }

  // Use full headers like live.js
  const headers = streamHeaders(sessionData, config, channelId, sessionData.authToken, decodedCookie, clientIp);

  // ── Sub-playlist M3U8 ─────────────────────────────────────
  if (hls) {
    let realUrl = await decrypt(hls);
    if (!realUrl) return new Response('# Decryption failed', { status: 400 });
    realUrl = realUrl.replace('.jitendraunatti', '.m3u8');
    console.log("Fetching HLS:", realUrl);

    const result  = await jioFetch(realUrl, headers, 'GET', null);
    console.log("HLS Result Code:", result.info.http_code);
    if (result.info.http_code !== 200 || (!result.data.includes('#EXTM3U') && !result.data.includes('#EXTINF'))) {
      console.log("HLS failed. Data:", result.data);
      return new Response(result.data, { status: 403 });
    }
    const decBase = (await decrypt(janeFoster)) || janeFoster;

    const lines = result.data.split('\n');
    const out   = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { out.push(''); continue; }

      if (line.includes('URI="')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch) {
          const keyUrl = uriMatch[1];
          const absoluteKeyUrl = keyUrl.startsWith('http') ? keyUrl : decBase + keyUrl;
          const encKeyUrl = await encrypt(absoluteKeyUrl);
          out.push(line.replace(`URI="${keyUrl}"`, `URI="${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&id=${channelId}&thor=${thorB64}&pkey=${encKeyUrl}"`));
        } else {
          out.push(line);
        }
      } else if (line.includes('.ts') && !line.startsWith('#')) {
        const encBase = await encrypt(decBase);
        const encFull = await encrypt(decBase + line);
        out.push(`${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&marvel=${encFull}`);
      } else {
        out.push(raw);
      }
    }

    const devBy = config.JITENDRA_UNIVERSE?.['x-developed-by'] || 'JioTV';
    const tok   = config.JITENDRA_UNIVERSE?.token || '';
    let m3u8 = out.join('\n');
    m3u8 = m3u8.replace('#EXTM3U', `#EXTM3U\n#DEVELOPED_BY_${devBy}\n#AUTHOR-${tok}`);
    m3u8 = m3u8.replace(/\.ts/g, '.jitendraunatti');

    return new Response(m3u8.trim(), {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      }
    });
  }

  // ── TS Segment ────────────────────────────────────────────
  if (marvel) {
    let realUrl = await decrypt(marvel);
    if (!realUrl) return new Response('# Decryption failed', { status: 400 });
    realUrl = realUrl.replace('.jitendraunatti', '.ts');

    const result = await jioFetch(realUrl, headers, 'GET', null);
    if (result.info.http_code !== 200 || !result.dataBuffer || result.dataBuffer.byteLength < 100) {
      return new Response(result.data, { status: 403 });
    }
    return new Response(result.dataBuffer, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=60',
      }
    });
  }

  // ── Encryption Key ────────────────────────────────────────
  if (pkey) {
    const realKeyUrl = await decrypt(pkey);
    if (!realKeyUrl) return new Response('# Decryption failed', { status: 400 });

    const result = await jioFetch(realKeyUrl, headers, 'GET', null);
    if (result.info.http_code !== 200 || !result.dataBuffer || result.dataBuffer.byteLength === 0) {
      return new Response(result.data, { status: 403 });
    }
    return new Response(result.dataBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  return new Response('#WANDA_ERROR: missing params', {
    headers: { 'Content-Type': 'text/plain' }
  });
}
