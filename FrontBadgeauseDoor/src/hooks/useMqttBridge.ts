import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";

import type { BadgeEventPayload } from "@/types/floor";

interface MqttLog {
  ts: number;
  topic: string;
  payload: string;
}

type BadgeCommandPayload = {
  badgeId: string;
  doorId?: string;
};

const parseBadgeEvent = (raw: unknown, deviceId: string): BadgeEventPayload | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, any>;
  if ("badgeID" in data || "doorID" in data) {
    const badgeID = String(data.badgeID ?? "");
    const doorID = data.doorID ? String(data.doorID) : undefined;
    const timestamp = String(data.timestamp ?? new Date().toISOString());
    return { badgeID, doorID, timestamp, deviceId };
  }
  if (data.type === "badge_event") {
    const inner = (data.data as Record<string, any>) || {};
    const badgeID = String(inner.badge_id ?? inner.tag_id ?? "");
    const doorID = inner.door_id ? String(inner.door_id) : undefined;
    const timestamp = String(data.ts ?? data.timestamp ?? new Date().toISOString());
    return { badgeID, doorID, timestamp, deviceId };
  }
  return null;
};

export function useMqttBridge(initialUrl: string) {
  const [mqttUrl, setMqttUrl] = useState(initialUrl);
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [shouldConnect, setShouldConnect] = useState(true);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const shouldConnectRef = useRef(true);
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
          const deviceId = topic.split("/")[2] ?? "";
          const event = parseBadgeEvent(msg, deviceId);
          if (event && deviceId) {
            setLastBadge((p) => ({ ...p, [deviceId]: event }));
          }
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

  const connect = useCallback(() => setShouldConnect(true), []);
  const disconnect = useCallback(() => setShouldConnect(false), []);

  const publishBadgeCommand = useCallback(
    (deviceId: string, payload: BadgeCommandPayload) =>
      new Promise<void>((resolve, reject) => {
        const client = clientRef.current;
        if (!client || !client.connected) {
          return reject(new Error("MQTT non connecte"));
        }
        const topicDeviceId = (deviceId || "").trim();
        if (!topicDeviceId) {
          return reject(new Error("deviceId vide"));
        }
        const topic = `iot/badgeuse/${topicDeviceId}/commands`;
        const message = {
          action: "simulate_badge",
          timestamp: new Date().toISOString(),
          badgeID: payload.badgeId,
          ...(payload.doorId ? { doorID: payload.doorId } : {}),
        };
        client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
          if (err) {
            reject(err);
          } else {
            setLogs((l) => [{ ts: Date.now(), topic, payload: JSON.stringify(message) }, ...l].slice(0, 200));
            console.info("[MQTT] badge command", topic, message);
            resolve();
          }
        });
      }),
    []
  );

  return { mqttUrl, setMqttUrl, connected, isConnecting, connect, disconnect, porteState, lastBadge, logs, publishBadgeCommand };
}
