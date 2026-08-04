// ============================================================
// M3U8 Playlist Generator — mirrors PHP playlist.php
// Generates a full IPTV playlist with all JioTV + Zee5 channels
// ============================================================

function hexToStr(hex) {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i,i+2),16));
  return s;
}
const JIOTV_TOKEN = atob(hexToStr('536b6c5552553545556b46665331564e5156493d'));

const ZEE_LANG_MAP = {
  hi: 'Hindi', en: 'English', mr: 'Marathi', ta: 'Tamil',
  te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', bn: 'Bengali',
  gu: 'Gujarati', pa: 'Punjabi', or: 'Odia', bh: 'Bhojpuri', ur: 'Urdu'
};

export async function generatePlaylist(config, baseUrl, env) {
  const categories = config.channelCategoryMapping ?? {};
  const languages  = config.languageIdMapping      ?? {};

  // ── JioTV channels ──────────────────────────────────────
  let jioChannels = [];
  try {
    const cached = await env.KV.get('jiotv_channels', 'json');
    if (cached?.result) {
      jioChannels = cached.result;
    } else {
      const url = config.api_endpoint?.live_channels;
      if (url) {
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          jioChannels = data.result ?? [];
          await env.KV.put('jiotv_channels', JSON.stringify(data), { expirationTtl: 86400 });
        }
      }
    }
  } catch {}

  // ── Zee5 channels ───────────────────────────────────────
  let zeeChannels = [];
  try {
    const zeeUrl = config.zee_api?.web_api;
    if (zeeUrl) {
      const resp = await fetch(zeeUrl);
      if (resp.ok) zeeChannels = await resp.json();
    }
  } catch {}

  // ── Build M3U8 ──────────────────────────────────────────
  const lines = ['#EXTM3U x-tvg-url="https://tsepg.cf/epg.xml.gz"'];

  for (const ch of jioChannels) {
    const id    = ch.channel_id   ?? '';
    const name  = ch.channel_name ?? 'Unknown';
    const logo  = `https://jiotvimages.cdn.jio.com/dare_images/images/${ch.logoUrl ?? ''}`;
    const group = (categories[ch.channelCategoryId] ?? 'General') + ' (JioTV)';
    const lang  = languages[ch.channelLanguageId] ?? 'Hindi';
    const url   = `${baseUrl}/live.m3u8?id=${id}&token=${JIOTV_TOKEN}`;
    lines.push(`#EXTINF:-1 tvg-id="${id}" tvg-logo="${logo}" group-title="${group}" tvg-language="${lang}", ${name}`);
    lines.push(url);
  }

  for (const zee of (Array.isArray(zeeChannels) ? zeeChannels : [])) {
    const name  = zee.name     ?? 'Zee Channel';
    const logo  = zee.logo     ?? '';
    const group = (zee.genres  ?? 'Entertainment') + ' (Zee5)';
    const lang  = ZEE_LANG_MAP[zee.languages] ?? 'Hindi';
    const url   = `${baseUrl}/live.m3u8?id=${zee.link ?? ''}&token=${JIOTV_TOKEN}`;
    lines.push(`#EXTINF:-1 tvg-id="${zee.id ?? ''}" tvg-logo="${logo}" group-title="${group}" tvg-language="${lang}", ${name}`);
    lines.push(url);
  }

  // Additional addon channels from config
  if (Array.isArray(config.addon_service)) {
    for (const addonUrl of config.addon_service) {
      try {
        const resp = await fetch(addonUrl);
        if (resp.ok) lines.push(await resp.text());
      } catch {}
    }
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'attachment; filename="jiotv.m3u8"',
    }
  });
}
