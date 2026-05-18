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
  const client = getStompClient();
  if (client.connected) {
    callback();
  } else {
    connectListeners.push(callback);
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
