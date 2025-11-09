import { ORCH_URL } from "@/config";
import type { Floor } from "@/types/floor";

export async function fetchPlan(floorId: string) {
  const r = await fetch(`${ORCH_URL}/plans/${floorId}`);
  if (!r.ok) throw new Error("plan not found");
  return (await r.json()) as Floor;
}

export async function savePlan(floor: Floor) {
  await fetch(`${ORCH_URL}/plans/${floor.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(floor),
  });
}

export async function deleteDeviceOnOrch(deviceId: string, removeImage = false) {
  const url = `${ORCH_URL}/devices/${encodeURIComponent(deviceId)}?remove_image=${removeImage ? "1" : "0"}`;
  const r = await fetch(url, { method: "DELETE" });
  if (!r.ok) {
    if (r.status !== 404) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Suppression orchestrateur KO (${r.status}) ${txt}`);
    }
  }
  return true;
}

export async function pollUntilReady(kind: "badgeuse" | "porte", deviceId: string, timeoutMs = 15000, intervalMs = 800) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${ORCH_URL}/devices`);
      if (r.ok) {
        const arr: Array<{ id: string; kind: string; ready: boolean }> = await r.json();
        const found = arr.find((d) => d.id === deviceId && d.kind === kind);
        if (found?.ready) return true;
      }
    } catch {
      // retry later
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return false;
}

export async function badge(id: string, badgeId = "BADGE-TEST") {
  if (!id) return;
  const body: any = { badge_id: badgeId, success: true };
  const r = await fetch(`${ORCH_URL}/badge/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) alert(`Badge KO (${r.status})`);
}

export async function doorCmd(id: string, action: "open" | "close" | "toggle") {
  if (!id) return;
  const r = await fetch(`${ORCH_URL}/door/${id}/${action}`, { method: "POST" });
  if (!r.ok) alert(`Door ${action} KO (${r.status})`);
}

