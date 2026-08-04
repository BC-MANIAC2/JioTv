import { jioFetch } from './src/jio.js';

async function testApi(channelId) {
    const streamHeaders = [
        'os: android',
        'appName: RJIL_JioTV',
        'devicetype: phone',
        'osversion: 11',
        'Connection: Keep-Alive',
        'User-Agent: okhttp/4.2.2'
    ];
    // We don't have the real headers so it might just fail with 401 or 403, 
    // but let's see if we can use the KV to fetch the real JioTV API.
}
// wait, I don't need to write a script. The logs show the status is 451!
