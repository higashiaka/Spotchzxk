import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

export interface Streamer {
  id: string;
  name: string;
  price: number;
  totalVolume: number;
}

const DEFAULT_STREAMERS: Streamer[] = [
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

export const useStreamers = (): Streamer[] => {
  const [streamers, setStreamers] = useState<Streamer[]>(DEFAULT_STREAMERS);

  useEffect(() => {
    const q = query(collection(db, 'streamers'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const dbStreamers = new Map<string, any>();
      snap.docs.forEach(doc => dbStreamers.set(doc.id, doc.data()));
      
      setStreamers(prev => prev.map(s => {
        const dbData = dbStreamers.get(s.id);
        if (dbData) {
          return {
            ...s,
            price: dbData.price !== undefined ? dbData.price : s.price,
            totalVolume: dbData.totalVolume !== undefined ? dbData.totalVolume : s.totalVolume
          };
        }
        return s;
      }));
      
      // Inherit and dynamically append any newly initialized DB ones
      const newStreamers: Streamer[] = [];
      snap.docs.forEach(doc => {
        if (!DEFAULT_STREAMERS.find(ds => ds.id === doc.id)) {
           newStreamers.push({
             id: doc.id,
             name: doc.data().name || doc.id,
             price: doc.data().price || 100,
             totalVolume: doc.data().totalVolume || 0
           });
        }
      });
      
      if (newStreamers.length > 0) {
         setStreamers(prev => {
             const combined = [...prev];
             newStreamers.forEach(ns => {
                 if (!combined.find(c => c.id === ns.id)) combined.push(ns);
             });
             return combined;
         });
      }
    }, (err) => {
      console.error('Failed to subscribe to streamers array:', err);
    });

    return () => unsubscribe();
  }, []);

  return streamers;
};
