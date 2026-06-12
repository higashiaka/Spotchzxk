import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_URL } from './api';

/** App-wide singleton STOMP client instance */
let client: Client | null = null;

/** List of callbacks invoked on STOMP connect; used to restore subscriptions after reconnect */
const connectListeners: (() => void)[] = [];

/** Creates a new STOMP client on first call, or returns the existing singleton */
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

/** Registers an onConnect callback and returns a cleanup function.
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

/** Subscribes to a STOMP topic and returns an { unsubscribe } handle.
 *  Subscription is automatically restored on reconnect */
export function subscribeStomp(destination: string, callback: (message: any) => void) {
  const client = getStompClient();
  let subscription: any = null;
  let active = true;

  const unsub = registerOnConnect(() => {
    if (!active) return;
    if (subscription) {
      subscription.unsubscribe();
      subscription = null;
    }
    const nextSubscription = client.subscribe(destination, callback);
    if (!active) {
      nextSubscription.unsubscribe();
      return;
    }
    subscription = nextSubscription;
  });

  return {
    unsubscribe: () => {
      active = false;
      unsub();
      if (subscription) {
        subscription.unsubscribe();
        subscription = null;
      }
    }
  };
}
