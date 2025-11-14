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

    const log: MonitoringEntry = {
      id: this.makeId(),
      timestamp: Number.isNaN(ts) ? Date.now() : ts,
      isoTimestamp: new Date(Number.isNaN(ts) ? Date.now() : ts).toISOString(),
      badgeID: this.pickString(parsed?.data, "badgeID", "badge_id"),
      doorID: this.pickString(parsed?.data, "doorID", "door_id"),
      deviceId: this.pickString(parsed, "deviceId", "device_id"),
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
    return "info";
  }

  private buildMessage(topic: string, status: MonitoringStatus, payload: MonitoringPayload | null): string {
    if (topic === "manual_override") {
      const fullName = this.extractName(payload);
      const door = this.pickString(payload?.data, "doorID", "door_id") ?? "door";
      return `${door} opened manually${fullName ? ` for ${fullName}` : ""}`.trim();
    }
    if (topic === "badge_event") {
      const badge = this.pickString(payload?.data, "badgeID", "badge_id") ?? "unknown badge";
      if (status === "success") return `Access granted for ${badge}`;
      if (status === "failure") return `Access denied for ${badge}`;
      return `Badge event detected for ${badge}`;
    }
    switch (status) {
      case "success":
        return "Access granted";
      case "failure":
        return "Access denied";
      default:
        return "Event detected";
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
}



