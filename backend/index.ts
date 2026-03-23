import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { admin, db } from './firebase';
import { startEngine, submitTrade, updateStreamerSupply } from './engine';
import { getFollowerCounts, followerToSupply } from './chzzk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 거래 체결
app.post('/trade', submitTrade);

// ─── 익명 게스트 디바이스 등록 ────────────────────────────────────────────────
// 같은 디바이스(브라우저 fingerprint)는 항상 동일한 UID를 사용하도록 보장
app.post('/register-guest', async (req: Request, res: Response): Promise<void> => {
  const { fingerprint, uid } = req.body;
  if (!fingerprint || !uid) {
    res.status(400).json({ error: 'fingerprint and uid required' });
    return;
  }

  try {
    const mappingRef = db.collection('device_mappings').doc(fingerprint);
    const doc = await mappingRef.get();

    if (doc.exists) {
      const canonicalUid: string = doc.data()!.uid;
      if (canonicalUid !== uid) {
        // 동일 디바이스, 다른 세션 → canonical UID로 재로그인할 수 있도록 커스텀 토큰 발급
        const customToken = await admin.auth().createCustomToken(canonicalUid);
        res.json({ canonicalUid, customToken });
      } else {
        res.json({ canonicalUid });
      }
    } else {
      // 최초 등록
      await mappingRef.set({ uid, createdAt: Date.now() });
      res.json({ canonicalUid: uid });
    }
  } catch (err: any) {
    console.error('register-guest error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 팔로워 기반 발행량 동기화 (관리자용) ────────────────────────────────────
// Firestore streamers 컬렉션에서 chzzkChannelId 필드가 있는 종목의
// totalSupply를 치지직 팔로워 수 기반으로 업데이트
app.post('/admin/sync-followers', async (req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await db.collection('streamers').get();

    // chzzkChannelId가 설정된 종목만 처리
    const mapping: Record<string, string> = {}; // chzzkChannelId → streamerId
    snapshot.forEach(doc => {
      const chzzkChannelId = doc.data().chzzkChannelId;
      if (chzzkChannelId) {
        mapping[chzzkChannelId] = doc.id;
      }
    });

    const chzzkChannelIds = Object.keys(mapping);
    if (chzzkChannelIds.length === 0) {
      res.json({ updated: 0, message: 'No streamers with chzzkChannelId found' });
      return;
    }

    console.log(`[sync-followers] Fetching follower counts for ${chzzkChannelIds.length} channels...`);
    const followerCounts = await getFollowerCounts(chzzkChannelIds);

    const batch = db.batch();
    let updatedCount = 0;

    for (const [chzzkId, followerCount] of Object.entries(followerCounts)) {
      const streamerId = mapping[chzzkId];
      if (!streamerId) continue;

      const totalSupply = followerToSupply(followerCount);
      batch.update(db.collection('streamers').doc(streamerId), { totalSupply });
      updateStreamerSupply(streamerId, totalSupply); // 메모리 캐시도 즉시 반영
      updatedCount++;
    }

    await batch.commit();
    console.log(`[sync-followers] Updated ${updatedCount} streamers.`);
    res.json({ updated: updatedCount });

  } catch (err: any) {
    console.error('sync-followers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SSE Backend running on port ${PORT}`);
  startEngine();
});
