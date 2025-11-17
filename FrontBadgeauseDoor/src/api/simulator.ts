import { SIMULATOR_API_URL } from "@/config";

type DeviceKind = "badgeuse" | "porte";

interface SimulatorCreatePayload {
  kind: DeviceKind;
  device_id: string;
  door_id?: string | null;
}

async function simFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${SIMULATOR_API_URL}${path}`, init);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Simulator API ${response.status}: ${message || "request failed"}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function createSimulatorDevice(kind: DeviceKind, deviceId: string, doorId?: string | null) {
  const payload: SimulatorCreatePayload = {
    kind,
    device_id: deviceId,
  };
  if (doorId) {
    payload.door_id = doorId;
  }
  return simFetch("/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteSimulatorDevice(deviceId: string) {
  return simFetch(`/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
}
