import { db } from './firebase';
import { Request, Response } from 'express';
import { firestore } from 'firebase-admin';

interface Order {
  userId: string;
  streamerId: string;
  type: 'buy' | 'sell';
  quantity: number;
  estimatedPrice: number;
  timestamp: number;
}

// In-Memory Cycle Buffer: Saves Firebase API Write quotas natively by aggregating orders to execute per cycle
let pendingOrders: Order[] = [];

export const submitTrade = (req: Request, res: Response): void => {
  const { userId, streamerId, type, quantity, estimatedPrice } = req.body;
  if (!userId || !streamerId || !type || !quantity) {
    res.status(400).json({ error: 'Invalid trade data' });
    return;
  }

  // Push straight into server memory buffer. No Firebase write here!
  pendingOrders.push({
    userId,
    streamerId,
    type,
    quantity: Number(quantity),
    estimatedPrice: Number(estimatedPrice),
    timestamp: Date.now()
  });

  res.json({ status: 'queued' });
};

export const startEngine = (): void => {
  console.log('Starting Cyclic Matching Engine...');
  const CYCLE_INTERVAL_MS = 3000; // Executes batched logic every 3 seconds

  setInterval(async () => {
    if (pendingOrders.length === 0) return;

    // Snapshot the current queue for this cycle and clear the live queue
    const cycleOrders = [...pendingOrders];
    pendingOrders = [];

    console.log(`Cycle triggered: Processing ${cycleOrders.length} orders...`);

    // Group orders to optimize fetch costs
    const streamersToUpdate = new Set<string>();
    const usersToUpdate = new Set<string>();
    
    cycleOrders.forEach(o => {
      streamersToUpdate.add(o.streamerId);
      usersToUpdate.add(o.userId);
    });

    try {
      // Execute the entire cycle within a single heavy transaction for atomicity
      await db.runTransaction(async (transaction: firestore.Transaction) => {

        // 1. Fetch current streamers
        const streamerRefs = Array.from(streamersToUpdate).map(id => db.collection('streamers').doc(id));
        const streamerDocs = await transaction.getAll(...streamerRefs);
        
        const currentPrices: Record<string, number> = {};
        streamerDocs.forEach(doc => {
          if (doc.exists) {
            currentPrices[doc.id] = doc.data()?.price || 100;
          } else {
            currentPrices[doc.id] = 100; // default anchor
          }
        });

        // 2. Fetch current portfolios
        const portfolioRefs = Array.from(usersToUpdate).map(id => db.collection('portfolios').doc(id));
        const portfolioDocs = await transaction.getAll(...portfolioRefs);
        
        const portfolios: Record<string, any> = {};
        portfolioDocs.forEach(doc => {
          if (doc.exists) {
            portfolios[doc.id] = doc.data();
          } else {
            portfolios[doc.id] = { balance: 10000, shares: {} };
          }
        });

        // 3. Process each order and tally net volume per streamer
        const streamerNetVolume: Record<string, number> = {};
        const streamerGrossVolume: Record<string, number> = {};
        
        streamersToUpdate.forEach(id => {
           streamerNetVolume[id] = 0;
           streamerGrossVolume[id] = 0;
        });

        for (const order of cycleOrders) {
           const pData = portfolios[order.userId];
           const currentBalance = pData.balance || 0;
           const currentShares = (pData.shares && pData.shares[order.streamerId]) || 0;
           
           const cost = currentPrices[order.streamerId] * order.quantity;

           // Server-side validation
           if (order.type === 'buy') {
             if (currentBalance < cost) continue; // Skip invalid order
             pData.balance -= cost;
             if (!pData.shares) pData.shares = {};
             pData.shares[order.streamerId] = (pData.shares[order.streamerId] || 0) + order.quantity;
             streamerNetVolume[order.streamerId] += order.quantity; // Adds to Buy Volume
             streamerGrossVolume[order.streamerId] += order.quantity;
           } else if (order.type === 'sell') {
             if (currentShares < order.quantity) continue;
             pData.balance += cost;
             if (!pData.shares) pData.shares = {};
             pData.shares[order.streamerId] -= order.quantity;
             streamerNetVolume[order.streamerId] -= order.quantity; // Adds to Sell Volume
             streamerGrossVolume[order.streamerId] += order.quantity;
           }
        }

        // 4. Calculate new market prices dynamically according to VOLUME
        streamersToUpdate.forEach(streamerId => {
           let price = currentPrices[streamerId];
           const netVol = streamerNetVolume[streamerId]; 
           const grossVol = streamerGrossVolume[streamerId];
           
           // If aggregate Buys overpower Sells, netVol > 0 (Price Rises)
           // If aggregate Sells overpower Buys, netVol < 0 (Price Falls)
           const priceMultiplier = 1 + (netVol * 0.0005);
           price = Math.max(0.01, price * priceMultiplier);
           
           const ref = db.collection('streamers').doc(streamerId);
           transaction.set(ref, { 
             price,
             totalVolume: firestore.FieldValue.increment(grossVol)
           }, { merge: true });
        });

        // 5. Commit portfolios
        usersToUpdate.forEach(userId => {
           const ref = db.collection('portfolios').doc(userId);
           transaction.set(ref, portfolios[userId], { merge: true });
        });
        
        // 6. Push completed traces safely to firebase log linked entirely to user's identity nested path
        for (const order of cycleOrders) {
           const ref = db.collection('portfolios').doc(order.userId).collection('orders').doc();
           transaction.set(ref, {
             ...order,
             status: 'completed',
             executedPrice: currentPrices[order.streamerId]
           });
        }
      });
      
      console.log(`Cycle completed successfully: Prices adjusted heavily relative to batch volume.`);
    } catch (err: any) {
      console.error(`Error during core engine cycle: ${err.message}`);
    }
  }, CYCLE_INTERVAL_MS);
};
