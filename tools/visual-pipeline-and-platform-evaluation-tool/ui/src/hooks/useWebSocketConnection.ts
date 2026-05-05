import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/store/hooks";
import {
  wsConnecting,
  wsConnected,
  wsDisconnected,
  wsError,
  messageReceived,
} from "@/store/reducers/metrics.ts";

const getSSEUrl = () => `/metrics/stream`;

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export const useWebSocketConnection = () => {
  const dispatch = useAppDispatch();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptRef = useRef(0);
  const isIntentionalCloseRef = useRef(false);

  const clearReconnectTimeout = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const getReconnectDelay = () =>
    Math.min(
      RECONNECT_CONFIG.initialDelayMs *
        Math.pow(
          RECONNECT_CONFIG.backoffMultiplier,
          reconnectAttemptRef.current,
        ),
      RECONNECT_CONFIG.maxDelayMs,
    );

  const scheduleReconnect = () => {
    if (isIntentionalCloseRef.current) return;
    clearReconnectTimeout();
    const delay = getReconnectDelay();
    console.debug(
      `Scheduling SSE reconnection attempt ${reconnectAttemptRef.current + 1} in ${delay}ms`,
    );
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connectSSE();
    }, delay);
  };

  const connectSSE = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    dispatch(wsConnecting());

    try {
      const es = new EventSource(getSSEUrl());
      esRef.current = es;

      es.onopen = () => {
        console.debug("SSE connected");
        reconnectAttemptRef.current = 0;
        dispatch(wsConnected());
      };

      es.onmessage = (event) => {
        dispatch(messageReceived(event.data));
      };

      es.onerror = (error) => {
        console.error("SSE error:", error);
        dispatch(wsError("SSE connection error"));
        dispatch(wsDisconnected());
        es.close();
        esRef.current = null;
        scheduleReconnect();
      };
    } catch (error) {
      dispatch(wsError(`Failed to create SSE connection: ${error}`));
      scheduleReconnect();
    }
  };

  useEffect(() => {
    isIntentionalCloseRef.current = false;
    connectSSE();

    return () => {
      isIntentionalCloseRef.current = true;
      clearReconnectTimeout();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    disconnect: () => {
      isIntentionalCloseRef.current = true;
      clearReconnectTimeout();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    },
    reconnect: () => {
      isIntentionalCloseRef.current = false;
      reconnectAttemptRef.current = 0;
      clearReconnectTimeout();
      connectSSE();
    },
  };
};
