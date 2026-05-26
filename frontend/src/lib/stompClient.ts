// SockJS/STOMP 연결을 재사용해 실시간 주가, 거래, 확성기 이벤트를 구독합니다.
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_URL } from './api';

let client: Client | null = null;
const connectListeners: (() => void)[] = [];

export function getStompClient(): Client {
  if (!client) {
    client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 3000,
    });
    client.onConnect = () => {
      connectListeners.forEach(listener => {
        try {
          listener();
        } catch (e) {
          console.error('Error in STOMP onConnect listener:', e);
        }
      });
    };
    client.activate();
  }
  return client;
}

export function registerOnConnect(callback: () => void): () => void {
  // 항상 connectListeners에 추가 → 재연결 시에도 구독 복구됨
  connectListeners.push(callback);
  const client = getStompClient();
  // 이미 연결 중이면 즉시 실행
  if (client.connected) {
    try { callback(); } catch (e) { console.error('Error in STOMP onConnect listener:', e); }
  }
  return () => {
    const idx = connectListeners.indexOf(callback);
    if (idx !== -1) {
      connectListeners.splice(idx, 1);
    }
  };
}

export function subscribeStomp(destination: string, callback: (message: any) => void) {
  const client = getStompClient();
  let subscription: any = null;

  const unsub = registerOnConnect(() => {
    subscription = client.subscribe(destination, callback);
  });

  return {
    unsubscribe: () => {
      unsub();
      if (subscription) {
        subscription.unsubscribe();
      }
    }
  };
}
