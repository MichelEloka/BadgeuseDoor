import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";

import type { BadgeEventPayload } from "@/types/floor";

interface MqttLog {
  ts: number;
  topic: string;
  payload: string;
}

export function useMqttBridge(initialUrl: string) {
  const [mqttUrl, setMqttUrl] = useState(initialUrl);
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [shouldConnect, setShouldConnect] = useState(false);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const shouldConnectRef = useRef(false);
  const [porteState, setPorteState] = useState<Record<string, boolean>>({});
  const [lastBadge, setLastBadge] = useState<Record<string, BadgeEventPayload>>({});
  const [logs, setLogs] = useState<MqttLog[]>([]);

  useEffect(() => {
    shouldConnectRef.current = shouldConnect;
  }, [shouldConnect]);

  useEffect(() => {
    if (!shouldConnect) {
      setIsConnecting(false);
      setConnected(false);
      if (clientRef.current) {
        try {
          clientRef.current.end(true);
        } catch {
          // ignore errors
        }
        clientRef.current = null;
      }
      return;
    }

    setIsConnecting(true);

    if (clientRef.current) {
      try {
        clientRef.current.end(true);
      } catch {
        // ignore cleanup errors
      }
      clientRef.current = null;
    }

    const c = mqtt.connect(mqttUrl, { reconnectPeriod: 2000 });
    clientRef.current = c;
    c.on("connect", () => {
      setConnected(true);
      setIsConnecting(false);
      c.subscribe("iot/porte/+/state", { qos: 1 });
      c.subscribe("iot/badgeuse/+/events", { qos: 1 });
    });
    c.on("reconnect", () => {
      setConnected(false);
      setIsConnecting(true);
    });
    c.on("close", () => {
      setConnected(false);
      if (!shouldConnectRef.current) {
        setIsConnecting(false);
      } else {
        setIsConnecting(true);
      }
    });
    c.on("message", (topic, payload) => {
      setLogs((l) => [{ ts: Date.now(), topic, payload: payload.toString() }, ...l].slice(0, 200));
      try {
        const msg = JSON.parse(payload.toString());
        if (topic.startsWith("iot/porte/")) {
          const id = msg.device_id as string;
          setPorteState((p) => ({ ...p, [id]: !!msg.data?.is_open }));
        } else if (topic.startsWith("iot/badgeuse/")) {
          const id = msg.device_id as string;
          setLastBadge((p) => ({ ...p, [id]: msg }));
        }
      } catch {
        // best effort parsing
      }
    });
    return () => {
      try {
        c.end(true);
      } catch {
        // swallow
      }
    };
  }, [mqttUrl, shouldConnect]);

  const connect = () => setShouldConnect(true);
  const disconnect = () => setShouldConnect(false);

  return { mqttUrl, setMqttUrl, connected, isConnecting, connect, disconnect, porteState, lastBadge, logs };
}
