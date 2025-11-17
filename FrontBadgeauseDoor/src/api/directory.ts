import { ENTRANCE_API_URL } from "@/config";

export interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  badgeID?: string;
}

export interface DirectoryDeviceRecord {
  id: string;
  type: string;
  createdAt: string;
  builtin: boolean;
  location?: string | null;
}

function buildUrl(path: string) {
  const base = ENTRANCE_API_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Entrance API ${response.status}: ${text || "request failed"}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  if (response.status === 205) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export function fetchDirectoryUsers(signal?: AbortSignal) {
  return fetchJson<DirectoryUser[]>("/users", { signal });
}

export function fetchDirectoryDevices(signal?: AbortSignal) {
  return fetchJson<DirectoryDeviceRecord[]>("/devices", { signal });
}

export function fetchDoorIds(signal?: AbortSignal) {
  return fetchJson<string[]>("/doors", { signal });
}

export function createDirectoryDevice(type: "porte" | "badgeuse", options?: { preferredId?: string; targetDoorId?: string }) {
  const payload: Record<string, unknown> = { type };
  if (options?.preferredId) {
    payload.deviceId = options.preferredId;
  }
  if (options?.targetDoorId) {
    payload.targetDoorId = options.targetDoorId;
  }
  return fetchJson<DirectoryDeviceRecord>("/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteDirectoryDevice(deviceId: string) {
  const response = await fetch(buildUrl(`/devices/${encodeURIComponent(deviceId)}`), {
    method: "DELETE",
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Entrance API ${response.status}: ${text || "request failed"}`);
  }
}

export function updateDirectoryDevice(deviceId: string, patch: { location?: string | null }) {
  return fetchJson<DirectoryDeviceRecord>(`/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
