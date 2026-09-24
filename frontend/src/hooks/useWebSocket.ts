import {liveSocketUrl} from '../lib/backend-url';
import { useEffect, useRef, useState } from 'react';

export function useWebSocket(onEvent?: (event: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const callback = useRef(onEvent);
  useEffect(() => { callback.current = onEvent; }, [onEvent]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let socket: WebSocket;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(liveSocketUrl());
      socket.onopen = () => { if (!disposed) setIsConnected(true); };
      socket.onmessage = (message) => {
        if (disposed) return;
        try {
          const event = JSON.parse(message.data);
          setLastEvent(event);
          callback.current?.(event);
        } catch (error) { console.error('Invalid live event', error); }
      };
      socket.onclose = () => {
        if (disposed) return;
        setIsConnected(false);
        timer = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); socket?.close(); };
  }, []);
  return { isConnected, lastEvent };
}
