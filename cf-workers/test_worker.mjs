import { handleLive } from './src/live.js';
import { handleWanda } from './src/wanda.js';
import fs from 'fs';

const sessionData = {
    // We will inject the user's actual session data here later if needed,
    // or just mock it to see if it crashes before API call.
    deviceId: 'mock_device_id',
    sessionAttributes: { user: { subscriberId: 'mock_sub' } },
    authToken: 'mock_auth_token',
    ssoToken: 'mock_sso'
};

const config = {
    api_endpoint_static_value: {},
    JITENDRA_UNIVERSE: { token: 'JITENDRA_KUMAR' }
};

const baseUrl = 'https://jiotv.jiotv-joel.workers.dev';

// Mock env with KV
const env = {
    KV: {
        get: async (key) => {
            console.log(`KV get: ${key}`);
            if (key === 'jiotv_channels') return null;
            if (key.startsWith('stream_')) {
                // Mock stream response
                return {
                    code: 200,
                    message: "success",
                    result: "https://jiotvbpkmob.cdn.jio.com/bpk-tv/Asianet_News_MOB/Fallback/index.m3u8?minrate=80000&maxrate=3024000&__hdnea__=st=1785874500~exp=1785874620~acl=/bpk-tv/Asianet_News_MOB/Fallback/*~hmac=d9942e7a76537f66cd94cb03b06a5486f47b0e793bce83297214522b6b7326ec"
                };
            }
            return null;
        },
        put: async (key, val) => {
            console.log(`KV put: ${key}`);
        }
    }
};

async function test() {
    try {
        console.log("--- TESTING handleLive ---");
        const liveRes = await handleLive('180', sessionData, config, baseUrl, env);
        console.log("Live status:", liveRes.status);
        console.log("Live headers:", Object.fromEntries(liveRes.headers.entries()));
        const liveText = await liveRes.text();
        console.log("Live Body:\n" + liveText);

        // Find the first wanda.php?hls= link in liveText
        let wandaUrl = null;
        for (const line of liveText.split('\\n')) {
            if (line.includes('wanda.php') && line.includes('hls=')) {
                wandaUrl = line.trim();
                break;
            }
        }

        if (!wandaUrl) {
            console.log("ERROR: No wanda URL found in live.m3u8!");
            return;
        }

        console.log("\\n--- TESTING handleWanda ---");
        console.log("Fetching wandaUrl:", wandaUrl);

        // We need to fetch the actual HLS from JioTV to test handleWanda properly!
        // But we don't have a valid token.
        // Wait, jioFetch in wanda.js will try to fetch it. Let's see what it returns!
        const wandaReq = { url: wandaUrl };
        const wandaRes = await handleWanda(wandaReq, sessionData, config, baseUrl);
        
        console.log("Wanda status:", wandaRes.status);
        console.log("Wanda headers:", Object.fromEntries(wandaRes.headers.entries()));
        const wandaText = await wandaRes.text();
        console.log("Wanda Body length:", wandaText.length);
        console.log("Wanda Body (first 200 chars):\\n" + wandaText.slice(0, 200));

    } catch (e) {
        console.error("CRASH!", e);
    }
}

test();
