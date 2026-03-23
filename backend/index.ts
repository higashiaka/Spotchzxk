import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { startEngine, submitTrade } from './engine';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// High-speed receiver endpoints avoiding Database Latency per 100/reqs
app.post('/trade', submitTrade);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SSE Backend running on port ${PORT}`);
  startEngine();
});
