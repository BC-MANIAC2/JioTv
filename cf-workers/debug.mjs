import { encrypt, decrypt } from './src/crypto.js';

const streamUrl = "https://jiotvbpkmob.cdn.jio.com/bpk-tv/Asianet_News_MOB/Fallback/index.m3u8?minrate=80000&maxrate=3024000&__hdnea__=st=1785874500~exp=1785874620~acl=/bpk-tv/Asianet_News_MOB/Fallback/*~hmac=d9942e7a76537f66cd94cb03b06a5486f47b0e793bce83297214522b6b7326ec";
const baseUrl = "https://jiotv.jiotv-joel.workers.dev";
const JIOTV_TOKEN = "JITENDRA_KUMAR";
const channelId = "180";
const thorB64 = encodeURIComponent(btoa("mock_cookie"));

const mockM3u8Data = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="audio_eng.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3024000,RESOLUTION=1920x1080,AUDIO="audio"
chunklist_high.m3u8?__hdnea__=st=1785874500~exp=1785874620~acl=/bpk-tv/Asianet_News_MOB/Fallback/*~hmac=d9942e7a76537f66cd94cb03b06a5486f47b0e793bce83297214522b6b7326ec
#EXT-X-STREAM-INF:BANDWIDTH=710000,RESOLUTION=852x480
chunklist_medium.m3u8?__hdnea__=st=1785874500~exp=1785874620~acl=/bpk-tv/Asianet_News_MOB/Fallback/*~hmac=d9942e7a76537f66cd94cb03b06a5486f47b0e793bce83297214522b6b7326ec
`;

async function test() {
  const urlObj = new URL(streamUrl);
  const basePath = urlObj.href.replace(/[^/]+$/, '');

  const lines = mockM3u8Data.split('\n');
  const out = [];

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
      const encBase = await encrypt(basePath);
      const encFull = await encrypt(basePath + line);
      out.push(`${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&hls=${encFull}`);
    } else if (line.includes('.ts') && !line.startsWith('#')) {
      const encBase = await encrypt(basePath);
      const encFull = await encrypt(basePath + line);
      const wandaLine = `${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&marvel=${encFull}`;
      out.push(wandaLine.replace('.ts', '.jitendraunatti'));
    } else {
      out.push(raw);
    }
  }

  const devBy = 'JioTV';
  const tok   = '';
  let m3u8 = out.join('\n');
  m3u8 = m3u8.replace('#EXTM3U', `#EXTM3U\n#DEVELOPED_BY_${devBy}\n#AUTHOR-${tok}`);

  console.log("FINAL GENERATED M3U8:");
  console.log(m3u8);
}

test();
