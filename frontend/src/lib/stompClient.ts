import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_URL } from './api';

/** 앱 전역에서 공유하는 STOMP 클라이언트 싱글턴
 *  App-wide singleton STOMP client instance */
let client: Client | null = null;

/** STOMP 연결 완료 시 호출될 콜백 목록 (재연결 시 재구독 복구에 사용)
 *  List of callbacks invoked on STOMP connect; used to restore subscriptions after reconnect */
const connectListeners: (() => void)[] = [];

/** STOMP 클라이언트를 처음 생성하거나 기존 인스턴스를 반환
 *  Creates a new STOMP client on first call, or returns the existing singleton */
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

/** 연결 완료 콜백을 등록하고 해제 함수를 반환.
 *  이미 연결 중이면 즉시 실행하며, 재연결 후에도 자동으로 재실행됨
 *  Registers an onConnect callback and returns a cleanup function.
 *  Executes immediately if already connected; auto-re-runs after reconnect */
export function registerOnConnect(callback: () => void): () => void {
  connectListeners.push(callback);
  const client = getStompClient();
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

/** 지정한 STOMP 토픽을 구독하고 { unsubscribe } 핸들을 반환.
 *  재연결 시에도 구독이 자동으로 복구됨
 *  Subscribes to a STOMP topic and returns an { unsubscribe } handle.
 *  Subscription is automatically restored on reconnect */
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
