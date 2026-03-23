import * as https from 'https';

// ─── Config ───────────────────────────────────────────────────────────────────
const CHZZK_API_BASE = 'https://openapi.chzzk.naver.com/open/v1';
const CHZZK_CLIENT_ID = process.env.CHZZK_CLIENT_ID ?? '';
const CHZZK_CLIENT_SECRET = process.env.CHZZK_CLIENT_SECRET ?? '';
const BATCH_SIZE = 100; // Chzzk API max channelIds per request

// 팔로워 → 발행량 변환 (÷10, 최소 10,000)
export const SUPPLY_DIVISOR = 10;
export const MIN_SUPPLY = 10_000;
// ─────────────────────────────────────────────────────────────────────────────

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Client-Id': CHZZK_CLIENT_ID,
        'Client-Secret': CHZZK_CLIENT_SECRET,
      },
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Chzzk API response')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Chzzk API timeout')); });
  });
}

// chzzkChannelId(실제 치지직 채널 ID 해시값) 배열을 받아 followerCount 반환
export async function getFollowerCounts(channelIds: string[]): Promise<Record<string, number>> {
  if (!CHZZK_CLIENT_ID || !CHZZK_CLIENT_SECRET) {
    console.warn('[Chzzk] CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET not set in .env');
    return {};
  }

  const result: Record<string, number> = {};

  for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
    const batch = channelIds.slice(i, i + BATCH_SIZE);
    const idsParam = batch.map(encodeURIComponent).join(',');
    const url = `${CHZZK_API_BASE}/channels?channelIds=${idsParam}`;

    try {
      const json = await fetchJson(url);
      const data: any[] = json?.content?.data ?? [];
      for (const ch of data) {
        if (ch.channelId && ch.followerCount !== undefined) {
          result[ch.channelId] = ch.followerCount;
        }
      }
    } catch (err: any) {
      console.error(`[Chzzk] Batch fetch error: ${err.message}`);
    }
  }

  return result;
}

// followerCount → totalSupply
export function followerToSupply(followerCount: number): number {
  return Math.max(MIN_SUPPLY, Math.floor(followerCount / SUPPLY_DIVISOR));
}
