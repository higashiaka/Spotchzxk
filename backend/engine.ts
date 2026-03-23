import { db } from './firebase';
import { Request, Response } from 'express';
import { firestore } from 'firebase-admin';

// ─── Config ───────────────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 3000; // Firestore 저장 주기 (ms) — 여기서 조절
// ─────────────────────────────────────────────────────────────────────────────

interface Portfolio {
  balance: number;
  shares: Record<string, number>;
}

interface StreamerState {
  price: number;
  totalSupply: number;   // 0 = 무제한. 팔로워 수 기반으로 /admin/sync-followers 에서 설정
  issuedShares: number;  // 현재 유통 중인 총 수량
}

interface CompletedOrder {
  userId: string;
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  estimatedPrice: number;
  executedPrice: number;
  timestamp: number;
  status: 'completed';
}

// ─── In-Memory State ──────────────────────────────────────────────────────────
const portfolioCache: Record<string, Portfolio> = {};
const streamerCache: Record<string, StreamerState> = {};
const volumeAccum: Record<string, { net: number; gross: number }> = {};

const dirtyPortfolios = new Set<string>();
const dirtyStreamers = new Set<string>();
const pendingOrderHistory: CompletedOrder[] = [];

// 동일 ID에 대한 중복 Firestore 읽기 방지
const portfolioLoading: Record<string, Promise<Portfolio>> = {};
const streamerLoading: Record<string, Promise<StreamerState>> = {};
// ─────────────────────────────────────────────────────────────────────────────

async function getPortfolio(userId: string): Promise<Portfolio> {
  if (portfolioCache[userId]) return portfolioCache[userId];
  if (!portfolioLoading[userId]) {
    portfolioLoading[userId] = db.collection('portfolios').doc(userId).get()
      .then(doc => {
        const data = (doc.data() as Portfolio) ?? { balance: 10000, shares: {} };
        portfolioCache[userId] = data;
        delete portfolioLoading[userId];
        return data;
      });
  }
  return portfolioLoading[userId];
}

async function getStreamer(streamerId: string): Promise<StreamerState> {
  if (streamerCache[streamerId]) return streamerCache[streamerId];
  if (!streamerLoading[streamerId]) {
    streamerLoading[streamerId] = db.collection('streamers').doc(streamerId).get()
      .then(doc => {
        const data = doc.data() ?? {};
        const state: StreamerState = {
          price: data.price ?? 100,
          totalSupply: data.totalSupply ?? 0,
          issuedShares: data.issuedShares ?? 0,
        };
        streamerCache[streamerId] = state;
        delete streamerLoading[streamerId];
        return state;
      });
  }
  return streamerLoading[streamerId];
}

// 외부(sync-followers)에서 totalSupply를 메모리에 즉시 반영하기 위한 함수
export function updateStreamerSupply(streamerId: string, totalSupply: number): void {
  if (streamerCache[streamerId]) {
    streamerCache[streamerId].totalSupply = totalSupply;
  } else {
    streamerCache[streamerId] = { price: 100, totalSupply, issuedShares: 0 };
  }
}

export const submitTrade = async (req: Request, res: Response): Promise<void> => {
  const { userId, streamerId, type, quantity, estimatedPrice } = req.body;

  if (!userId || !streamerId || !type || !quantity) {
    res.status(400).json({ error: 'Invalid trade data' });
    return;
  }

  const qty = Number(quantity);

  try {
    const [portfolio, streamer] = await Promise.all([
      getPortfolio(userId),
      getStreamer(streamerId),
    ]);

    // 가격 충격(market impact)을 먼저 적용한 뒤 그 가격으로 체결
    // → 자기 주문으로 가격을 올리고 즉시 되파는 차익 구조 원천 차단
    // 매수: 내 수요가 가격을 올린 뒤 올라간 가격에 체결 (불리)
    // 매도: 내 공급이 가격을 내린 뒤 내려간 가격에 체결 (불리)
    // 왕복 손익 = P × N × (1 - (N×k)²) < 0 (항상 손실)
    if (!volumeAccum[streamerId]) volumeAccum[streamerId] = { net: 0, gross: 0 };
    const netDelta = type === 'buy' ? qty : -qty;
    const priceMultiplier = 1 + (netDelta * 0.0005);
    const executedPrice = Math.max(0.01, streamer.price * priceMultiplier);
    streamer.price = executedPrice;

    volumeAccum[streamerId].net += netDelta;
    volumeAccum[streamerId].gross += qty;

    const cost = executedPrice * qty;

    if (type === 'buy') {
      // 잔액 검증
      if (portfolio.balance < cost) {
        res.status(400).json({ error: 'Insufficient balance' });
        return;
      }
      // 발행량 검증 (totalSupply = 0이면 무제한)
      if (streamer.totalSupply > 0 && streamer.issuedShares + qty > streamer.totalSupply) {
        res.status(400).json({ error: 'Supply limit reached' });
        return;
      }
      portfolio.balance -= cost;
      portfolio.shares[streamerId] = (portfolio.shares[streamerId] ?? 0) + qty;
      streamer.issuedShares += qty;

    } else if (type === 'sell') {
      const held = portfolio.shares[streamerId] ?? 0;
      if (held < qty) {
        res.status(400).json({ error: 'Insufficient shares' });
        return;
      }
      portfolio.balance += cost;
      portfolio.shares[streamerId] = held - qty;
      streamer.issuedShares -= qty;

    } else {
      res.status(400).json({ error: 'Invalid trade type' });
      return;
    }

    // dirty 표시 — 다음 flush 주기에 저장됨
    dirtyPortfolios.add(userId);
    dirtyStreamers.add(streamerId);

    pendingOrderHistory.push({
      userId,
      streamerId,
      type,
      quantity: qty,
      estimatedPrice: Number(estimatedPrice),
      executedPrice: executedPrice,
      timestamp: Date.now(),
      status: 'completed',
    });

    res.json({
      status: 'executed',
      executedPrice: streamer.price,
      newBalance: portfolio.balance,
    });

  } catch (err: any) {
    console.error('Trade error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const startEngine = (): void => {
  console.log(`Flush Engine started. Firestore sync interval: ${FLUSH_INTERVAL_MS}ms`);

  setInterval(async () => {
    if (dirtyPortfolios.size === 0 && dirtyStreamers.size === 0) return;

    // 현재 dirty 목록 스냅샷 후 즉시 초기화 (flush 중 새 거래 수용)
    const portfoliosToFlush = new Set(dirtyPortfolios);
    const streamersToFlush = new Set(dirtyStreamers);
    const ordersToFlush = [...pendingOrderHistory];
    const volumeSnapshot: Record<string, { net: number; gross: number }> = {};
    streamersToFlush.forEach(id => {
      if (volumeAccum[id]) volumeSnapshot[id] = { ...volumeAccum[id] };
      delete volumeAccum[id];
    });

    dirtyPortfolios.clear();
    dirtyStreamers.clear();
    pendingOrderHistory.length = 0;

    console.log(`Flushing — portfolios: ${portfoliosToFlush.size}, streamers: ${streamersToFlush.size}, orders: ${ordersToFlush.length}`);

    try {
      const batch = db.batch();

      portfoliosToFlush.forEach(userId => {
        const ref = db.collection('portfolios').doc(userId);
        batch.set(ref, portfolioCache[userId], { merge: true });
      });

      streamersToFlush.forEach(streamerId => {
        const ref = db.collection('streamers').doc(streamerId);
        const s = streamerCache[streamerId];
        const vol = volumeSnapshot[streamerId];
        batch.set(ref, {
          price: s.price,
          issuedShares: s.issuedShares,
          ...(vol ? { totalVolume: firestore.FieldValue.increment(vol.gross) } : {}),
        }, { merge: true });
      });

      ordersToFlush.forEach(order => {
        const ref = db.collection('portfolios').doc(order.userId).collection('orders').doc();
        batch.set(ref, order);
      });

      await batch.commit();
      console.log('Flush complete.');

    } catch (err: any) {
      console.error('Flush error:', err.message);
      // 실패 시 dirty 목록 복원 — 다음 주기에 재시도
      portfoliosToFlush.forEach(id => dirtyPortfolios.add(id));
      streamersToFlush.forEach(id => {
        dirtyStreamers.add(id);
        if (volumeSnapshot[id]) {
          if (!volumeAccum[id]) volumeAccum[id] = { net: 0, gross: 0 };
          volumeAccum[id].net += volumeSnapshot[id].net;
          volumeAccum[id].gross += volumeSnapshot[id].gross;
        }
      });
      ordersToFlush.forEach(o => pendingOrderHistory.push(o));
    }
  }, FLUSH_INTERVAL_MS);
};
