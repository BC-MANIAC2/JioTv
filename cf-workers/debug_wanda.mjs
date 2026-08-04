import { encrypt, decrypt } from './src/crypto.js';

const baseUrl = "https://jiotv.jiotv-joel.workers.dev";
const JIOTV_TOKEN = "JITENDRA_KUMAR";
const channelId = "180";
const thorB64 = encodeURIComponent(btoa("mock_cookie"));
const decBase = "https://jiotvbpkmob.cdn.jio.com/bpk-tv/Asianet_News_MOB/Fallback/";

const mockM3u8Data = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:12345
#EXT-X-KEY:METHOD=AES-128,URI="https://tv.media.jio.com/proxy?provider=reliance&content_id=9899988576&__hdnea__=st=1785874500~exp=1785874620~acl=/*~hmac=7296c7b65ba862627f3fdbf1dc33f597a620ac94ec19bf60794ce991a38cc033"
Asianet_News_MOB_Fallback_12345.ts
Asianet_News_MOB_Fallback_12346.ts
Asianet_News_MOB_Fallback_12347.ts
`;

async function test() {
  const lines = mockM3u8Data.split('\n');
  const out = [];

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
  m3u8 = m3u8.replace(/\.ts/g, '.jitendraunatti');

  console.log("FINAL WANDA GENERATED M3U8:");
  console.log(m3u8);
}

test();
