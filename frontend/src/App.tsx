import { useState, useMemo, useEffect } from 'react';
import { useStreamerPrice } from './hooks/useStreamerPrice';
import { useTrade } from './hooks/useTrade';
import { usePortfolio } from './hooks/usePortfolio';
import { useTransactionHistory } from './hooks/useTransactionHistory';
import { useStreamers, Streamer } from './hooks/useStreamers';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';

const Sparkline = ({ data }: { data: number[] }) => {
  if (data.length < 2) return <div className="h-full flex items-center justify-center text-gray-600 text-xs text-center px-4">Waiting for market movement...</div>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d - min) / range) * 100}`).join(' ');

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
       <polyline points={points} fill="none" stroke="#4ade80" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const TradeInterface = ({ streamer, user, portfolio, onBack }: { streamer: Streamer, user: User | null, portfolio: any, onBack: () => void }) => {
  const { currentPrice, previousPrice, direction } = useStreamerPrice(streamer.id, streamer.price);
  const tradeMutation = useTrade(user?.uid || 'spectator');
  const [quantityStr, setQuantityStr] = useState<string>("10");
  const quantity = Math.max(1, parseInt(quantityStr, 10) || 0);
  const [history, setHistory] = useState<number[]>([streamer.price]);

  useEffect(() => {
     setHistory(prev => {
        const next = [...prev, currentPrice];
        if (next.length > 20) next.shift(); // Keep 20 ticks mapped
        return next;
     });
  }, [currentPrice]);

  const estimatedCost = currentPrice * quantity;
  const canBuy = portfolio && portfolio.balance >= estimatedCost;
  const canSell = portfolio && (portfolio.shares[streamer.id] || 0) >= quantity;

  const handleTrade = (type: 'buy' | 'sell') => {
    if (!user) {
       alert("Please Login or Play as Guest first to trace valid orders.");
       return;
    }
    if (type === 'buy' && !canBuy) return;
    if (type === 'sell' && !canSell) return;

    tradeMutation.mutate({
      streamerId: streamer.id,
      type,
      quantity,
      estimatedPrice: currentPrice
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6 rounded-3xl shadow-2xl border border-gray-800 animate-in fade-in zoom-in duration-200">
      <button onClick={onBack} className="text-gray-400 hover:text-white self-start mb-6 flex items-center gap-2 transition-colors font-bold uppercase tracking-wider text-sm">
         <span className="text-xl">←</span> Market Board
      </button>
      
      <div className="flex justify-between items-start mb-6">
         <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">{streamer.name}</h2>
         <div className="text-right">
             <div className={`text-5xl font-mono font-bold transition-colors duration-300 ${direction === 'up' ? 'text-green-400' : direction === 'down' ? 'text-red-400' : 'text-white'}`}>
                ${currentPrice.toFixed(2)}
             </div>
             {direction !== 'none' && previousPrice !== null && (
               <span className={`font-mono font-bold text-md ${direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                 {direction === 'up' ? '▲' : '▼'} {Math.abs(currentPrice - previousPrice).toFixed(2)}
               </span>
             )}
         </div>
      </div>

      <div className="w-full h-32 bg-gray-950 border border-gray-800 rounded-xl mb-6 p-4 shadow-inner">
         <Sparkline data={history} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
         <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-md transition-all hover:bg-gray-700">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-bold">Total Demand Volume</p>
            <p className="font-mono text-2xl font-bold text-white">{streamer.totalVolume.toLocaleString()}</p>
         </div>
         <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-md transition-all hover:bg-gray-700">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-bold">My Personal SA</p>
            <p className="font-mono text-2xl font-bold text-blue-400">{portfolio?.shares[streamer.id] || 0} SA</p>
         </div>
      </div>

      <div className="w-full mb-6 mt-auto">
          <label className="block text-gray-400 text-sm font-bold mb-2 uppercase tracking-wide" htmlFor="quantity">
              Order Quantity
          </label>
          <input 
              type="number" 
              id="quantity"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              min="1"
              disabled={!user}
              placeholder={!user ? "Authentication Required" : ""}
              className="w-full bg-gray-950 text-white rounded-xl border border-gray-700 py-4 px-4 focus:outline-none focus:border-blue-500 font-mono text-center text-3xl shadow-inner transition-colors disabled:opacity-50"
          />
          <div className="flex justify-between items-center mt-3 px-2">
              <span className="text-gray-500 text-sm font-bold">Total Net Execution Cost:</span>
              <span className="text-gray-200 font-mono font-bold text-lg">${estimatedCost.toFixed(2)}</span>
          </div>
      </div>

      <div className="flex w-full gap-4">
         <button 
           onClick={() => handleTrade('buy')}
           disabled={tradeMutation.isPending || !canBuy || !user}
           className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 focus:scale-[0.98] text-white font-bold py-4 px-4 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-lg"
         >
           Buy {user ? quantity : 'Disabled'}
         </button>
         <button 
           onClick={() => handleTrade('sell')}
           disabled={tradeMutation.isPending || !canSell || !user}
           className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 focus:scale-[0.98] text-white font-bold py-4 px-4 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-lg"
         >
           Sell {user ? quantity : 'Disabled'}
         </button>
      </div>
    </div>
  );
};

const DEFAULT_STREAMERS = [
  { id: 'chzzk-hle-delight', name: 'HLE Delight', price: 100, totalVolume: 0 },
  { id: 'chzzk-hle-gumayusi', name: 'HLE Gumayusi', price: 100, totalVolume: 0 },
  { id: 'chzzk-hle-kanavi', name: 'HLE Kanavi', price: 100, totalVolume: 0 },
  { id: 'chzzk-hle-zeka', name: 'HLE Zeka', price: 100, totalVolume: 0 },
  { id: 'chzzk-hle-zeus', name: 'HLE Zeus', price: 100, totalVolume: 0 },
  { id: 'chzzk-kangsoyeon', name: '강소연', price: 100, totalVolume: 0 },
  { id: 'chzzk-kangji', name: '강지', price: 100, totalVolume: 0 },
  { id: 'chzzk-kangqui', name: '강퀴', price: 100, totalVolume: 0 },
  { id: 'chzzk-gaebogeo', name: '개복어', price: 100, totalVolume: 0 },
  { id: 'chzzk-gankim', name: '갱맘', price: 100, totalVolume: 0 },
  { id: 'chzzk-gyechunhwe', name: '계춘회', price: 100, totalVolume: 0 },
  { id: 'chzzk-gochabi', name: '고차비', price: 100, totalVolume: 0 },
  { id: 'chzzk-monster-mouse', name: '괴물쥐', price: 100, totalVolume: 0 },
  { id: 'chzzk-geumsahyang', name: '금사향', price: 100, totalVolume: 0 },
  { id: 'chzzk-geumhwi', name: '금휘', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimnaseong', name: '김나성', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimnambong', name: '김남봉', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimdo', name: '김도', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimdduddi', name: '김뚜띠', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimblue', name: '김블루', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimbbung', name: '김뿡', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimjungmin', name: '김정민', price: 100, totalVolume: 0 },
  { id: 'chzzk-kimhorror', name: '김호러', price: 100, totalVolume: 0 },
  { id: 'chzzk-kkolrangi', name: '꼴랑이', price: 100, totalVolume: 0 },
  { id: 'chzzk-kkotbin', name: '꽃빈', price: 100, totalVolume: 0 },
  { id: 'chzzk-kkotpin', name: '꽃핀', price: 100, totalVolume: 0 },
  { id: 'chzzk-nanayang', name: '나나양', price: 100, totalVolume: 0 },
  { id: 'chzzk-namgunghyuk', name: '남궁혁', price: 100, totalVolume: 0 },
  { id: 'chzzk-neobul', name: '너불', price: 100, totalVolume: 0 },
  { id: 'chzzk-neneko', name: '네네코 마시로', price: 100, totalVolume: 0 },
  { id: 'chzzk-necrit', name: '네클릿', price: 100, totalVolume: 0 },
  { id: 'chzzk-nofe', name: '노페', price: 100, totalVolume: 0 },
  { id: 'chzzk-nokduro', name: '녹두로', price: 100, totalVolume: 0 },
  { id: 'chzzk-nonggwan', name: '농관전', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-box', name: '농심 BOX', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-exito', name: '농심 Exito', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-ryuk', name: '농심 RYUK', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-ppuljebi', name: '농심 ppuljebi', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-dambi', name: '농심 담비', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-redforce', name: '농심 레드포스', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-lehends', name: '농심 리헨즈', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-scout', name: '농심 스카웃', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-sponge', name: '농심 스폰지', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-ivy', name: '농심 아이비', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-albi', name: '농심 알비', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-xross', name: '농심 엑스로스', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-calix', name: '농심 칼릭스', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-kingen', name: '농심 킹겐', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-taeyoon', name: '농심 태윤', price: 100, totalVolume: 0 },
  { id: 'chzzk-ns-francis', name: '농심 프란시스', price: 100, totalVolume: 0 },
  { id: 'chzzk-nyorongi', name: '뇨롱이', price: 100, totalVolume: 0 },
  { id: 'chzzk-noonkkot', name: '눈꽃', price: 100, totalVolume: 0 },
  { id: 'chzzk-neujjam', name: '늦잠', price: 100, totalVolume: 0 },
  { id: 'chzzk-ninia', name: '니니아', price: 100, totalVolume: 0 },
  { id: 'chzzk-daju', name: '다주', price: 100, totalVolume: 0 },
  { id: 'chzzk-dalkomrena', name: '달콤레나', price: 100, totalVolume: 0 },
  { id: 'chzzk-dawn', name: '던', price: 100, totalVolume: 0 },
  { id: 'chzzk-dopa', name: '도파', price: 100, totalVolume: 0 },
  { id: 'chzzk-dokcake', name: '독케익', price: 100, totalVolume: 0 },
  { id: 'chzzk-dunijuni', name: '두니주니', price: 100, totalVolume: 0 },
  { id: 'chzzk-dunggeure', name: '둥그레', price: 100, totalVolume: 0 },
  { id: 'chzzk-ddahyoni', name: '따효니', price: 100, totalVolume: 0 },
  { id: 'chzzk-ttolttoli', name: '똘똘똘이', price: 100, totalVolume: 0 },
  { id: 'chzzk-radiyu', name: '라디유', price: 100, totalVolume: 0 },
  { id: 'chzzk-ralo', name: '랄로', price: 100, totalVolume: 0 },
  { id: 'chzzk-lucky', name: '러끼', price: 100, totalVolume: 0 },
  { id: 'chzzk-runner', name: '러너', price: 100, totalVolume: 0 },
  { id: 'chzzk-reva', name: '레바', price: 100, totalVolume: 0 },
  { id: 'chzzk-rutae', name: '루태', price: 100, totalVolume: 0 },
  { id: 'chzzk-looksam', name: '룩삼', price: 100, totalVolume: 0 },
  { id: 'chzzk-lilka', name: '릴카', price: 100, totalVolume: 0 },
  { id: 'chzzk-mareflos', name: '마레플로스', price: 100, totalVolume: 0 },
  { id: 'chzzk-mamwa', name: '마뫄', price: 100, totalVolume: 0 },
  { id: 'chzzk-mangnae', name: '망내', price: 100, totalVolume: 0 },
  { id: 'chzzk-mulluckking', name: '멀럭킹', price: 100, totalVolume: 0 },
  { id: 'chzzk-mutsa', name: '멋사', price: 100, totalVolume: 0 },
  { id: 'chzzk-medal', name: '명예훈장', price: 100, totalVolume: 0 },
  { id: 'chzzk-morara', name: '모라라', price: 100, totalVolume: 0 },
  { id: 'chzzk-mochahyung', name: '모카형', price: 100, totalVolume: 0 },
  { id: 'chzzk-michir', name: '미치르', price: 100, totalVolume: 0 },
  { id: 'chzzk-baedon', name: '배돈', price: 100, totalVolume: 0 },
  { id: 'chzzk-baekgompa', name: '백곰파', price: 100, totalVolume: 0 },
  { id: 'chzzk-bang', name: '뱅', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-gideon', name: '브리온 기드온', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-namgung', name: '브리온 남궁', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-roamer', name: '브리온 로머', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-loki', name: '브리온 로키', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-casting', name: '브리온 캐스팅', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-teddy', name: '브리온 테디', price: 100, totalVolume: 0 },
  { id: 'chzzk-brion-fisher', name: '브리온 피셔', price: 100, totalVolume: 0 },
  { id: 'chzzk-vicha', name: '브이챠', price: 100, totalVolume: 0 },
  { id: 'chzzk-bighead', name: '빅헤드', price: 100, totalVolume: 0 },
  { id: 'chzzk-ppibu', name: '삐부', price: 100, totalVolume: 0 },
  { id: 'chzzk-sakihane', name: '사키하네 후야', price: 100, totalVolume: 0 },
  { id: 'chzzk-salgu', name: '살구', price: 100, totalVolume: 0 },
  { id: 'chzzk-samsik', name: '삼식', price: 100, totalVolume: 0 },
  { id: 'chzzk-samway', name: '샘웨', price: 100, totalVolume: 0 },
  { id: 'chzzk-seoneng', name: '서넹', price: 100, totalVolume: 0 },
  { id: 'chzzk-saddummy', name: '서새봄', price: 100, totalVolume: 0 },
  { id: 'chzzk-seolbaek', name: '설백', price: 100, totalVolume: 0 },
  { id: 'chzzk-sonishow', name: '소니쇼', price: 100, totalVolume: 0 },
  { id: 'chzzk-souler', name: '소우릎', price: 100, totalVolume: 0 },
  { id: 'chzzk-sopoong', name: '소풍왔니', price: 100, totalVolume: 0 },
  { id: 'chzzk-suryun', name: '수련수련', price: 100, totalVolume: 0 },
  { id: 'chzzk-sherry', name: '쉐리', price: 100, totalVolume: 0 },
  { id: 'chzzk-snarang', name: '스나랑', price: 100, totalVolume: 0 },
  { id: 'chzzk-shirayuki', name: '시라유키 히나', price: 100, totalVolume: 0 },
  { id: 'chzzk-sylph', name: '실프', price: 100, totalVolume: 0 },
  { id: 'chzzk-ssangbe', name: '쌍베', price: 100, totalVolume: 0 },
  { id: 'chzzk-crag', name: '씨랙', price: 100, totalVolume: 0 },
  { id: 'chzzk-aguibbo', name: '아구이뽀', price: 100, totalVolume: 0 },
  { id: 'chzzk-tabi', name: '아라하시 타비', price: 100, totalVolume: 0 },
  { id: 'chzzk-arisa', name: '아리사', price: 100, totalVolume: 0 },
  { id: 'chzzk-fatherking', name: '아빠킹', price: 100, totalVolume: 0 },
  { id: 'chzzk-uni', name: '아야츠노 유니', price: 100, totalVolume: 0 },
  { id: 'chzzk-rin', name: '아오쿠모 린', price: 100, totalVolume: 0 },
  { id: 'chzzk-lize', name: '아카네 리제', price: 100, totalVolume: 0 },
  { id: 'chzzk-ryu', name: '아카이로 류', price: 100, totalVolume: 0 },
  { id: 'chzzk-ambition', name: '앰비션', price: 100, totalVolume: 0 },
  { id: 'chzzk-yapyap', name: '얍얍', price: 100, totalVolume: 0 },
  { id: 'chzzk-yadda', name: '얏따', price: 100, totalVolume: 0 },
  { id: 'chzzk-yangdding', name: '양띵', price: 100, totalVolume: 0 },
  { id: 'chzzk-yangaji', name: '양아지', price: 100, totalVolume: 0 },
  { id: 'chzzk-eris', name: '에리스', price: 100, totalVolume: 0 },
  { id: 'chzzk-elli', name: '엘리', price: 100, totalVolume: 0 },
  { id: 'chzzk-youngdu', name: '영듀', price: 100, totalVolume: 0 },
  { id: 'chzzk-oknyang', name: '옥냥이', price: 100, totalVolume: 0 },
  { id: 'chzzk-wadid', name: '와디드', price: 100, totalVolume: 0 },
  { id: 'chzzk-yoru', name: '요룰레히', price: 100, totalVolume: 0 },
  { id: 'chzzk-untara', name: '운타라', price: 100, totalVolume: 0 },
  { id: 'chzzk-wolf', name: '울프', price: 100, totalVolume: 0 },
  { id: 'chzzk-yuzuha', name: '유즈하 리코', price: 100, totalVolume: 0 },
  { id: 'chzzk-yunga', name: '윤가놈', price: 100, totalVolume: 0 },
  { id: 'chzzk-eaglecob', name: '이글콥', price: 100, totalVolume: 0 },
  { id: 'chzzk-irona', name: '이로나묭 치카', price: 100, totalVolume: 0 },
  { id: 'chzzk-leesun', name: '이선생', price: 100, totalVolume: 0 },
  { id: 'chzzk-leechohong', name: '이초홍', price: 100, totalVolume: 0 },
  { id: 'chzzk-leechunhyang', name: '이춘향', price: 100, totalVolume: 0 },
  { id: 'chzzk-inganjelly', name: '인간젤리', price: 100, totalVolume: 0 },
  { id: 'chzzk-insec', name: '인섹', price: 100, totalVolume: 0 },
  { id: 'chzzk-imnaeun', name: '임나은', price: 100, totalVolume: 0 },
  { id: 'chzzk-jadong', name: '자동', price: 100, totalVolume: 0 },
  { id: 'chzzk-jack', name: '잭', price: 100, totalVolume: 0 },
  { id: 'chzzk-jongmal', name: '종말맨', price: 100, totalVolume: 0 },
  { id: 'chzzk-judoongi', name: '주둥이방송', price: 100, totalVolume: 0 },
  { id: 'chzzk-jinu', name: '지누', price: 100, totalVolume: 0 },
  { id: 'chzzk-chaehyun', name: '채현찌', price: 100, totalVolume: 0 },
  { id: 'chzzk-chulmyun', name: '철면수심', price: 100, totalVolume: 0 },
  { id: 'chzzk-choseung', name: '초승달', price: 100, totalVolume: 0 },
  { id: 'chzzk-chicken', name: '치킨쿤', price: 100, totalVolume: 0 },
  { id: 'chzzk-karin', name: '카린', price: 100, totalVolume: 0 },
  { id: 'chzzk-kandeer', name: '칸데르니아', price: 100, totalVolume: 0 },
  { id: 'chzzk-captainjack', name: '캡틴잭', price: 100, totalVolume: 0 },
  { id: 'chzzk-kane', name: '케인', price: 100, totalVolume: 0 },
  { id: 'chzzk-kongkong', name: '콩콩', price: 100, totalVolume: 0 },
  { id: 'chzzk-kuha', name: '쿠하', price: 100, totalVolume: 0 },
  { id: 'chzzk-cuvee', name: '큐베', price: 100, totalVolume: 0 },
  { id: 'chzzk-crank', name: '크랭크', price: 100, totalVolume: 0 },
  { id: 'chzzk-ccat', name: '크캣', price: 100, totalVolume: 0 },
  { id: 'chzzk-tamttam', name: '탬탬버린', price: 100, totalVolume: 0 },
  { id: 'chzzk-tenko', name: '텐코 시부키', price: 100, totalVolume: 0 },
  { id: 'chzzk-paka', name: '파카', price: 100, totalVolume: 0 },
  { id: 'chzzk-portia', name: '포셔', price: 100, totalVolume: 0 },
  { id: 'chzzk-purin', name: '푸린', price: 100, totalVolume: 0 },
  { id: 'chzzk-poong', name: '풍월량', price: 100, totalVolume: 0 },
  { id: 'chzzk-flurry', name: '플러리', price: 100, totalVolume: 0 },
  { id: 'chzzk-flame', name: '플레임', price: 100, totalVolume: 0 },
  { id: 'chzzk-phoenixpark', name: '피닉스박', price: 100, totalVolume: 0 },
  { id: 'chzzk-pingman', name: '핑맨', price: 100, totalVolume: 0 },
  { id: 'chzzk-hanako', name: '하나코 나나', price: 100, totalVolume: 0 },
  { id: 'chzzk-haruto', name: '하루토', price: 100, totalVolume: 0 },
  { id: 'chzzk-haha', name: '하하', price: 100, totalVolume: 0 },
  { id: 'chzzk-doodoo', name: '한동숙', price: 100, totalVolume: 0 },
  { id: 'chzzk-haeverlin', name: '해블린', price: 100, totalVolume: 0 },
  { id: 'chzzk-haetsal', name: '햇살살', price: 100, totalVolume: 0 },
  { id: 'chzzk-hangdol', name: '행돌', price: 100, totalVolume: 0 },
  { id: 'chzzk-hyang', name: '향아치', price: 100, totalVolume: 0 },
  { id: 'chzzk-honeychu', name: '허니츄러스', price: 100, totalVolume: 0 },
  { id: 'chzzk-hejil', name: '헤징', price: 100, totalVolume: 0 },
  { id: 'chzzk-huchu', name: '후추', price: 100, totalVolume: 0 },
  { id: 'chzzk-hiren', name: '히렌', price: 100, totalVolume: 0 }
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const streamers = useStreamers();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStreamer, setActiveStreamer] = useState<Streamer | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch(err) {
      console.error(err);
      alert("Login Error: Is your Firebase Auth Domain setup securely?");
    }
  };

  const handleGuestLogin = async () => {
    try {
      // Firebase automatically caches Anonymous auth tokens natively inside IndexedDB exactly as instructed
      await signInAnonymously(auth);
    } catch(err) {
      console.error(err);
      alert("Guest Login Error: Navigate to Firebase Console > Authentication > Sign-in Method and ENABLE 'Anonymous' provider!");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const userId = user?.uid;
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(userId);
  const { data: history, isLoading: historyLoading } = useTransactionHistory(userId);

  const filteredStreamers = useMemo(() => {
    let s = streamers;
    if (searchQuery.trim()) {
      s = s.filter(st => st.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return s.sort((a, b) => b.totalVolume - a.totalVolume);
  }, [streamers, searchQuery]);

  if (authChecking) {
    return <div className="h-screen bg-gray-950 text-white flex items-center justify-center font-mono">Initializing High-Speed Exchange Engine...</div>;
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex overflow-hidden font-sans">
      
      {/* LEFT SIDEBAR - Account Frame */}
      <div className="w-full md:w-1/4 max-w-sm bg-gray-900 border-r border-gray-800 flex flex-col h-full shadow-2xl relative z-10 shrink-0">
         <div className="p-6 border-b border-gray-800">
             <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-tighter mb-1">
               Spotchzxk
             </h1>
             <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Global Streamer Exchange</p>
         </div>

         {!user ? (
           <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-900/50">
             <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-6 shadow-inner border border-gray-700">
               <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
             </div>
             <h2 className="text-2xl font-bold mb-2 text-gray-100">Spectator Mode</h2>
             <p className="text-sm text-gray-400 mb-8 leading-relaxed">You are viewing the open market. Log in to claim your wallet and begin trading instantly with live volumes.</p>
             
             <div className="w-full space-y-4">
               <button onClick={handleGoogleLogin} className="w-full bg-white text-gray-950 font-black tracking-wide py-4 px-4 rounded-xl shadow-lg hover:bg-gray-100 transition-all flex items-center justify-center gap-2 hover:scale-[1.02]">
                 <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                 Google Auth
               </button>
               <button onClick={handleGuestLogin} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 px-4 rounded-xl shadow transition-all border border-gray-700 hover:border-gray-500 hover:scale-[1.02]">
                 Play as Anonymous Guest
               </button>
             </div>
           </div>
         ) : (
           <div className="p-6 overflow-y-auto flex-1 flex flex-col hide-scrollbar">
             <div className="flex items-center justify-between mb-8 bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm">
               <div>
                 <p className="font-bold text-gray-100 max-w-28 truncate">{user.isAnonymous ? 'Guest' : user.displayName || 'Trader'}</p>
                 <p className="text-xs text-gray-500 font-mono mt-0.5">UID: {user.uid.slice(0, 6)}</p>
               </div>
               <button onClick={handleLogout} className="bg-gray-900 hover:bg-red-900/40 text-xs px-3 py-2 border border-gray-700 rounded-lg transition-colors text-gray-300 hover:text-red-400 font-bold uppercase tracking-wider">
                  Out
               </button>
             </div>

             <div className="mb-10 pl-1">
               <h2 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-3">Treasury Cash</h2>
               <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700 shadow-xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-green-500/20 transition-colors"></div>
                 <p className="text-gray-400 text-sm mb-1 font-medium relative z-10">Available Reserve</p>
                 {portfolioLoading ? (
                    <div className="h-10 w-32 bg-gray-700 animate-pulse rounded mt-2 relative z-10"></div>
                 ) : (
                    <p className="text-4xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300 relative z-10">${portfolio?.balance?.toFixed(2) || '0.00'}</p>
                 )}
               </div>
             </div>

             <div className="mb-8 flex-1 pl-1">
               <h2 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-3 flex items-center justify-between">
                 <span>Vault Assets</span>
                 <span className="bg-gray-800 px-2 py-0.5 rounded text-[10px] border border-gray-700">SA</span>
               </h2>
               {portfolio && Object.keys(portfolio.shares).length > 0 ? (
                 <div className="space-y-3">
                   {Object.entries(portfolio.shares).filter(([_, qty]) => qty > 0).map(([sId, qty]) => {
                     const s = streamers.find(st => st.id === sId) || DEFAULT_STREAMERS.find(ds => ds.id === sId);
                     if (!s) return null;
                     return (
                       <div key={sId} onClick={() => setActiveStreamer(s)} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center cursor-pointer hover:border-blue-500 transition-colors group shadow-sm">
                          <div>
                            <p className="font-bold text-gray-200 group-hover:text-blue-400 transition-colors">{s.name}</p>
                            <p className="text-xs text-gray-500 font-mono mt-1">${s.price.toFixed(2)} / share</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-blue-400 font-mono bg-blue-500/10 px-2 py-1 rounded inline-block">{qty}</p>
                            <p className="text-xs text-green-400 font-mono mt-1 pr-1">${(s.price * qty).toFixed(2)}</p>
                          </div>
                       </div>
                     );
                   })}
                 </div>
               ) : (
                 <div className="text-gray-600 text-sm font-medium text-center p-8 bg-gray-800/30 rounded-2xl border border-gray-800 border-dashed">Wallet empty. Start trading.</div>
               )}
             </div>
           </div>
         )}
      </div>

      {/* RIGHT MAIN - Dashboard */}
      <div className="flex-1 bg-[#090e14] p-6 lg:p-10 flex flex-col h-full overflow-y-auto w-full relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
        {!activeStreamer ? (
          <div className="flex flex-col h-full max-w-6xl mx-auto w-full animate-in fade-in duration-300 relative z-10">
             
             <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-10 gap-6">
                <div>
                   <h2 className="text-5xl font-black text-white tracking-tight">Market Live</h2>
                   <p className="text-gray-400 text-sm mt-3 font-medium uppercase tracking-widest">Volume-driven dynamic pricing</p>
                </div>
                <div className="relative w-full md:w-96">
                   <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                   <input 
                     type="text" 
                     placeholder="Search stocks by name..." 
                     value={searchQuery}
                     onChange={e => setSearchQuery(e.target.value)}
                     className="w-full bg-gray-900/80 backdrop-blur-sm text-white pl-12 pr-4 py-4 rounded-2xl border border-gray-700 focus:outline-none focus:border-blue-500 shadow-xl transition-all font-medium text-lg placeholder-gray-600"
                   />
                </div>
             </div>

             <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 auto-rows-max mb-10">
                {filteredStreamers.length > 0 ? filteredStreamers.map(streamer => (
                   <div 
                     key={streamer.id} 
                     onClick={() => setActiveStreamer(streamer)}
                     className="bg-gray-900/80 backdrop-blur border border-gray-800 p-6 rounded-3xl shadow-xl cursor-pointer transition-all hover:-translate-y-2 hover:border-blue-500 group relative overflow-hidden flex flex-col justify-between min-h-[160px]"
                   >
                      <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors pointer-events-none"></div>
                      <div className="flex justify-between items-start mb-4 relative z-10">
                         <h3 className="font-bold text-2xl text-gray-100 group-hover:text-blue-400 transition-colors tracking-tight">{streamer.name}</h3>
                         <div className="bg-gray-950 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-gray-400 border border-gray-800 flex items-center gap-2 shadow-inner">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                            VOL: {streamer.totalVolume.toLocaleString()}
                         </div>
                      </div>
                      <div className="flex justify-between items-end relative z-10 mt-auto">
                         <div>
                            <p className="text-4xl font-mono font-black text-green-400 drop-shadow-sm">${streamer.price.toFixed(2)}</p>
                         </div>
                         <button className="text-white text-sm font-bold bg-blue-600/20 group-hover:bg-blue-600 px-6 py-3 rounded-xl transition-all shadow-md group-hover:shadow-blue-500/30 backdrop-blur-sm">
                            Trade →
                         </button>
                      </div>
                   </div>
                )) : (
                   <div className="col-span-full py-16 text-center text-gray-500 font-medium bg-gray-900/30 rounded-3xl border border-gray-800 border-dashed">Market Empty. No assets found matching "{searchQuery}".</div>
                )}
             </div>
             
             {/* Transaction Trace History Log Panel */}
             <div className="bg-gray-900/80 backdrop-blur p-8 rounded-3xl shadow-2xl border border-gray-800 overflow-hidden flex flex-col w-full relative z-10">
                 <h2 className="text-2xl font-black mb-6 text-gray-100 flex items-center gap-3 tracking-tight">
                 	<svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                 	Live Global Ledger <span className="text-sm font-medium text-gray-500 tracking-normal hidden md:inline">{user ? '- Active Output traces' : '- Please login to view trace logs'}</span>
                 </h2>
                 {historyLoading ? (
                   <p className="text-blue-400/50 animate-pulse text-sm font-mono tracking-widest">CONNECTING TO NODES...</p>
                 ) : history && history.length > 0 ? (
                   <div className="space-y-3 pb-2">
                     {history.map(order => {
                       const refName = streamers.find(s => s.id === order.streamerId)?.name || order.streamerId;
                       return (
                       <div key={order.id} className="bg-gray-950/60 border border-gray-800 flex flex-col sm:flex-row sm:justify-between sm:items-center p-5 rounded-2xl text-sm transition-all hover:bg-gray-800 w-full group">
                         <div className="flex items-center gap-5 mb-3 sm:mb-0">
                            <span className={`font-black uppercase px-4 py-2 rounded-lg text-xs tracking-widest shadow-inner ${order.type === 'buy' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                               {order.type}
                            </span>
                            <span className="text-gray-200 font-mono tracking-tight font-medium text-lg">{order.quantity} x <span className="text-gray-500 group-hover:text-blue-400 transition-colors">{refName}</span></span>
                         </div>
                         <div className="sm:text-right flex justify-between sm:block w-full sm:w-auto items-center">
                            <div className="font-mono text-gray-100 text-xl font-bold">${(order.executedPrice || order.estimatedPrice).toFixed(2)}</div>
                            <div className={`text-xs font-black uppercase tracking-widest mt-1 ${order.status === 'completed' ? 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]' : order.status === 'failed' ? 'text-red-500' : 'text-yellow-500 animate-pulse'}`}>
                               {order.status}
                            </div>
                         </div>
                       </div>
                     )})}
                   </div>
                 ) : (
                   <div className="text-gray-500 font-medium italic flex items-center h-48 justify-center bg-gray-950/40 rounded-2xl border border-dashed border-gray-800 shadow-inner">
                      {user ? "No finalized blocks found on ledger." : "Spectators are restricted from querying private ledgers."}
                   </div>
                 )}
             </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full h-full flex flex-col items-center justify-center relative z-10 px-4">
               <TradeInterface 
                 streamer={activeStreamer} 
                 user={user} 
                 portfolio={portfolio} 
                 onBack={() => setActiveStreamer(null)} 
               />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
