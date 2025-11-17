import { Injectable, NgZone } from "@angular/core";
import { BehaviorSubject } from "rxjs";

import { environment } from "../../../environments/environment";
import type { ConnectionState, MonitoringEntry, MonitoringPayload, MonitoringStatus } from "../models/monitoring-entry.model";

@Injectable({ providedIn: "root" })
export class LogStreamService {
  private socket?: WebSocket;
  private readonly decoder = new TextDecoder();
  private readonly maxLogs = environment.maxEntries ?? 200;

  private readonly connectionStateSubject = new BehaviorSubject<ConnectionState>("idle");
  private readonly logsSubject = new BehaviorSubject<MonitoringEntry[]>([]);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly currentUrlSubject = new BehaviorSubject<string | null>(null);

  readonly connectionState$ = this.connectionStateSubject.asObservable();
  readonly logs$ = this.logsSubject.asObservable();
  readonly lastError$ = this.errorSubject.asObservable();
  readonly currentUrl$ = this.currentUrlSubject.asObservable();

  constructor(private readonly zone: NgZone) {}

  connect(url: string) {
    if (!url) {
      return;
    }
    this.disconnect(false);
    this.connectionStateSubject.next("connecting");
    this.errorSubject.next(null);
    this.currentUrlSubject.next(url);

    try {
      this.socket = new WebSocket(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to open websocket";
      this.zone.run(() => {
        this.errorSubject.next(message);
        this.connectionStateSubject.next("error");
        this.currentUrlSubject.next(null);
      });
      return;
    }

    const socket = this.socket;

    socket.addEventListener("open", () => {
      this.zone.run(() => {
        this.connectionStateSubject.next("connected");
      });
    });

    socket.addEventListener("close", () => {
      this.zone.run(() => {
        if (this.connectionStateSubject.value !== "idle") {
          this.connectionStateSubject.next("error");
        }
        this.currentUrlSubject.next(null);
      });
    });

    socket.addEventListener("error", () => {
      this.zone.run(() => {
        this.errorSubject.next("Stream unavailable");
        this.connectionStateSubject.next("error");
        this.currentUrlSubject.next(null);
      });
    });

    socket.addEventListener("message", (event) => {
      const data = event.data;
      if (data instanceof Blob) {
        data
          .text()
          .then((text) => this.zone.run(() => this.handleMessage("websocket", text)))
          .catch(() =>
            this.zone.run(() => {
              this.errorSubject.next("Payload binaire non supporté");
            })
          );
      } else {
        this.zone.run(() => this.handleMessage("websocket", data));
      }
    });
  }

  disconnect(resetState = true) {
    if (this.socket) {
      try {
        this.socket.close(1000, "client disconnect");
      } catch {
        // ignore
      }
      this.socket = undefined;
    }
    if (resetState) {
      this.connectionStateSubject.next("idle");
      this.currentUrlSubject.next(null);
    }
  }

  clear() {
    this.logsSubject.next([]);
  }

  private handleMessage(source: string, payload: Uint8Array | ArrayBuffer | string | null | undefined) {
    const rawPayload = this.decodePayload(payload);
    const parsed = this.normalizePayload(this.safeParse(rawPayload));
    const tsRaw = parsed?.ts || parsed?.timestamp || undefined;
    const ts = tsRaw ? Date.parse(tsRaw) : Date.now();
    const status = this.resolveStatus(parsed);
    const topic = (parsed as { type?: string } | null)?.type ?? source;
    const message = this.buildMessage(topic, status, parsed);
    const badgeID = this.extractBadgeId(parsed);
    const doorID = this.extractDoorId(parsed);
    const deviceId = this.extractDeviceId(parsed);

    const log: MonitoringEntry = {
      id: this.makeId(),
      timestamp: Number.isNaN(ts) ? Date.now() : ts,
      isoTimestamp: new Date(Number.isNaN(ts) ? Date.now() : ts).toISOString(),
      badgeID,
      doorID,
      deviceId,
      status,
      topic,
      message,
      raw: rawPayload,
      payload: parsed,
    };

    const nextLogs = [log, ...this.logsSubject.value].slice(0, this.maxLogs);
    this.logsSubject.next(nextLogs);
  }

  private decodePayload(payload: Uint8Array | ArrayBuffer | string | null | undefined): string {
    if (!payload) {
      return "";
    }
    if (typeof payload === "string") {
      return payload;
    }
    if (payload instanceof Uint8Array) {
      return this.decoder.decode(payload);
    }
    if (payload instanceof ArrayBuffer) {
      return this.decoder.decode(new Uint8Array(payload));
    }
    if (typeof (payload as { toString?: () => string }).toString === "function") {
      return (payload as { toString: () => string }).toString();
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return "";
    }
  }

  private safeParse(raw: string): unknown {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizePayload(value: unknown): MonitoringPayload | null {
    if (!value || typeof value !== "object") {
      return null;
    }
    return value as MonitoringPayload;
  }

  private pickString(source: any, ...keys: string[]): string | null {
    if (!source || typeof source !== "object") {
      return null;
    }
    for (const key of keys) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return null;
  }

  private resolveStatus(payload: MonitoringPayload | null): MonitoringStatus {
    const success = payload?.data?.success;
    if (success === true) return "success";
    if (success === false) return "failure";
    const statusText = this.extractStatusLabel(payload);
    if (statusText) {
      const normalized = statusText.trim().toLowerCase();
      if (/(allow|autorise|grant|success|accept|ok|green)/.test(normalized)) {
        return "success";
      }
      if (/(deny|refus|fail|error|ko|reject|block|unauthor)/.test(normalized)) {
        return "failure";
      }
    }
    return "info";
  }

  private buildMessage(topic: string, status: MonitoringStatus, payload: MonitoringPayload | null): string {
    const badge = this.extractBadgeId(payload) ?? "badge inconnu";
    const door = this.extractDoorId(payload) ?? "porte inconnue";
    const statusLabel = this.extractStatusLabel(payload);

    if (topic === "manual_override") {
      const fullName = this.extractName(payload);
      const targetDoor = door || "porte";
      return `${targetDoor} ouverte manuellement${fullName ? ` pour ${fullName}` : ""}`.trim();
    }
    if (topic === "badge_event" || statusLabel) {
      if (status === "success") return `Accès autorisé pour ${badge}`;
      if (status === "failure") return `Accès refusé pour ${badge}`;
      return `${statusLabel ?? "Evènement"} pour ${badge}`;
    }
    switch (status) {
      case "success":
        return `Accès autorisé pour ${badge}`;
      case "failure":
        return `Accès refusé pour ${badge}`;
      default:
        return `Evènement détecté sur ${door}`;
    }
  }

  private extractName(payload: MonitoringPayload | null): string | null {
    const first = this.pickString(payload?.data, "firstName", "first_name");
    const last = this.pickString(payload?.data, "lastName", "last_name");
    const joined = [first, last].filter(Boolean).join(" ").trim();
    return joined.length ? joined : null;
  }

  private makeId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `log-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  }

  private extractBadgeId(payload: MonitoringPayload | null): string | null {
    return this.pickString(payload, "badgeID", "badge_id") ?? this.pickString(payload?.data, "badgeID", "badge_id") ?? null;
  }

  private extractDoorId(payload: MonitoringPayload | null): string | null {
    return this.pickString(payload, "doorID", "door_id") ?? this.pickString(payload?.data, "doorID", "door_id") ?? null;
  }

  private extractDeviceId(payload: MonitoringPayload | null): string | null {
    return this.pickString(payload, "deviceId", "device_id") ?? this.pickString(payload?.data, "deviceId", "device_id") ?? null;
  }

  private extractStatusLabel(payload: MonitoringPayload | null): string | null {
    return this.pickString(payload, "status", "result", "action", "state");
  }
}



