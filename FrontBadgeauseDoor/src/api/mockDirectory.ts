import { MOCK_API_URL } from "@/config";

export interface MockUser {
  id: string;
  firstName: string;
  lastName: string;
  badgeID?: string;
}

export interface MockDeviceRecord {
  id: string;
  type: string;
  createdAt: string;
  builtin: boolean;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MOCK_API_URL}${path}`, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mock API ${response.status}: ${text || "request failed"}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export function fetchMockUsers(signal?: AbortSignal) {
  return fetchJson<MockUser[]>("/users", { signal });
}

export function fetchMockDevices(signal?: AbortSignal) {
  return fetchJson<MockDeviceRecord[]>("/devices", { signal });
}

export function createMockDevice(type: "porte" | "badgeuse") {
  return fetchJson<MockDeviceRecord>("/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
}

export async function deleteMockDevice(deviceId: string) {
  const response = await fetch(`${MOCK_API_URL}/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mock API ${response.status}: ${text || "request failed"}`);
  }
}
