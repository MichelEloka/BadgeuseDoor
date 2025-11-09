import React, { useEffect, useMemo, useRef, useState } from "react";
import mqtt from "mqtt";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DoorOpen,
  DoorClosed,
  KeyRound,
  Hand,
  Ruler,
  Square,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";

/**
 * App.tsx — Workspace plan + devices
 * - Création via orchestrateur + spinner + polling readiness
 * - Portes alignées au mur le plus proche (projection sur segment)
 * - Animation d’ouverture autour du gond (hinge)
 * - ✅ Persistance du plan (walls/boxes/nodes) côté orchestrateur
 * - ✅ Affichage du statut Docker (running/ready) pour chaque device
 * - ✅ Badgeuse capte automatiquement l’ID de la porte “touchée”
 */

// ====== CONFIG ======
const ORCH_URL = import.meta.env.VITE_ORCH_URL || "http://localhost:9002";
const MQTT_WS_URL_DEFAULT = "ws://localhost:9001";
const BADGEUSE_LINK_RADIUS = 60; // px (dans le repère du plan) pour “toucher” une porte

// ====== Types ======
export type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; thick?: number };
export type Box = { id: string; x: number; y: number; w: number; h: number; thick?: number };
export type Hinge = "left" | "right";
export type DeviceNode = {
  id: string;
  kind: "porte" | "badgeuse";
  deviceId?: string;
  x: number;
  y: number;
  rot?: number;
  hinge?: Hinge;
  /** Porte liée pour badgeuse (deviceId de la porte) */
  targetDoorId?: string;
};
export type Floor = { id: string; name: string; width: number; height: number; walls: Wall[]; boxes: Box[]; nodes: DeviceNode[] };

interface BadgeEventPayload {
  device_id: string;
  type: "badge_event";
  ts: string;
  data: { tag_id: string; success: boolean; door_id?: string };
}

// ====== Utils réseau (plan) ======
async function fetchPlan(floorId: string) {
  const r = await fetch(`${ORCH_URL}/plans/${floorId}`);
  if (!r.ok) throw new Error("plan not found");
  return (await r.json()) as Floor;
}

async function savePlan(floor: Floor) {
  await fetch(`${ORCH_URL}/plans/${floor.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(floor),
  });
}

function useDebouncedEffect(effect: () => void, deps: any[], delay = 700) {
  useEffect(() => {
    const t = setTimeout(effect, delay);
    return () => clearTimeout(t);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// ====== Utils géométrie ======
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snap = (v: number, grid = 10) => Math.round(v / grid) * grid;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Projection d'un point P sur un segment AB. */
function projectPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax,
    aby = by - ay;
  const apx = px - ax,
    apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { x: ax, y: ay, t: 0, angle: 0, d: Math.hypot(px - ax, py - ay) };
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * abx,
    y = ay + t * aby;
  const angle = Math.atan2(aby, abx);
  const d = Math.hypot(px - x, py - y);
  return { x, y, t, angle, d };
}

function nearestWallSnap(
  walls: Wall[],
  px: number,
  py: number
): null | { x: number; y: number; angle: number; wallId: string } {
  if (!walls.length) return null;
  let best: any = null;
  for (const w of walls) {
    const proj = projectPointOnSegment(px, py, w.x1, w.y1, w.x2, w.y2);
    if (!best || proj.d < best.d) best = { ...proj, wallId: w.id };
  }
  return best ? { x: best.x, y: best.y, angle: best.angle, wallId: best.wallId } : null;
}

// ====== Spinner simple ======
function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  const s = `${size}px`;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" fill="none" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
    </svg>
  );
}

// ====== App ======
export default function App() {
  // --- Layout / UI
  const [showConn, setShowConn] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // --- Plan initial (sera remplacé par le plan persistant s'il existe)
  const [floors, setFloors] = useState<Floor[]>([
    {
      id: "etage-1",
      name: "Étage 1",
      width: 1400,
      height: 900,
      walls: [
        { id: uid(), x1: 80, y1: 80, x2: 1320, y2: 80, thick: 8 },
        { id: uid(), x1: 1320, y1: 80, x2: 1320, y2: 820, thick: 8 },
        { id: uid(), x1: 1320, y1: 820, x2: 80, y2: 820, thick: 8 },
        { id: uid(), x1: 80, y1: 820, x2: 80, y2: 80, thick: 8 },
        // petite cloison
        { id: uid(), x1: 400, y1: 80, x2: 400, y2: 300, thick: 8 },
      ],
      boxes: [],
      nodes: [],
    },
  ]);
  const [selFloorId, setSelFloorId] = useState("etage-1");
  const floor = useMemo(() => floors.find((f) => f.id === selFloorId)!, [floors, selFloorId]);

  // === Chargement du plan persistant au mount
  useEffect(() => {
    (async () => {
      try {
        const p = await fetchPlan(selFloorId);
        // protège le schéma en cas de diff de version
        setFloors((fs) => fs.map((f) => (f.id === selFloorId ? { ...f, ...p } : f)));
      } catch {
        // pas de plan — on garde le défaut
      }
    })();
  }, [selFloorId]);

  // === Autosave (debounced) du floor courant à chaque modif
  useDebouncedEffect(() => {
    const f = floors.find((x) => x.id === selFloorId);
    if (f) savePlan(f).catch(() => {});
  }, [floors, selFloorId], 700);

  // --- Tools
  type Tool = "pan" | "wall-line" | "wall-rect" | "place-porte" | "place-badgeuse" | "select";
  const [tool, setTool] = useState<Tool>("pan");
  const [grid, setGrid] = useState(10);
  const [thick, setThick] = useState(8);

  // --- Canvas transforms
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const panRef = useRef<{ drag: boolean; sx: number; sy: number; ox: number; oy: number }>(
    {
      drag: false,
      sx: 0,
      sy: 0,
      ox: 0,
      oy: 0,
    }
  );
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // --- Drawing states
  const [drawLineStart, setDrawLineStart] = useState<{ x1: number; y1: number } | null>(null);
  const [drawRectStart, setDrawRectStart] = useState<{ x: number; y: number } | null>(null);

  // --- Sélection
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const selNode = floor?.nodes.find((n) => n.id === selNodeId) || null;

  // --- MQTT & logs
  const [mqttUrl, setMqttUrl] = useState(MQTT_WS_URL_DEFAULT);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const [porteState, setPorteState] = useState<Record<string, boolean>>({});
  const [lastBadge, setLastBadge] = useState<Record<string, BadgeEventPayload>>({});
  const [logs, setLogs] = useState<{ ts: number; topic: string; payload: string }[]>([]);

  useEffect(() => {
    if (clientRef.current) {
      try {
        clientRef.current.end(true);
      } catch {}
      clientRef.current = null;
    }
    const c = mqtt.connect(mqttUrl, { reconnectPeriod: 2000 });
    clientRef.current = c;
    c.on("connect", () => {
      setConnected(true);
      c.subscribe("iot/porte/+/state", { qos: 1 });
      c.subscribe("iot/badgeuse/+/events", { qos: 1 });
    });
    c.on("reconnect", () => setConnected(false));
    c.on("close", () => setConnected(false));
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
      } catch {}
    });
    return () => {
      try {
        c.end(true);
      } catch {}
    };
  }, [mqttUrl]);

  // --- Loading par device + poll readiness
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  async function pollUntilReady(kind: "badgeuse" | "porte", deviceId: string, timeoutMs = 15000, intervalMs = 800) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${ORCH_URL}/devices`);
        if (r.ok) {
          const arr: Array<{ id: string; kind: string; ready: boolean }> = await r.json();
          const found = arr.find((d) => d.id === deviceId && d.kind === kind);
          if (found?.ready) return true;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, intervalMs));
    }
    return false;
  }

  // 🔎 Trouver la porte la plus proche (pour lier une badgeuse)
  function findNearestDoorDeviceId(x: number, y: number): string | undefined {
    let bestId: string | undefined;
    let bestD = Infinity;
    for (const n of floor.nodes) {
      if (n.kind !== "porte" || !n.deviceId) continue;
      const d = dist(x, y, n.x, n.y);
      if (d < bestD) {
        bestD = d;
        bestId = n.deviceId;
      }
    }
    return bestD <= BADGEUSE_LINK_RADIUS ? bestId : undefined;
  }

  // --- Orchestrateur: création service avec spinner + poll
  async function ensureService(kind: "badgeuse" | "porte", deviceId: string, badgeuseDoorId?: string) {
    if (!deviceId) {
      alert("Renseigne un deviceId");
      return;
    }
    setLoadingMap((m) => ({ ...m, [deviceId]: true }));
    try {
      const body: any = { kind, device_id: deviceId };
      if (kind === "badgeuse" && badgeuseDoorId) {
        body.door_id = badgeuseDoorId; // ✅ on envoie l’ID de la porte “touchée”
      }
      const r = await fetch(`${ORCH_URL}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        alert(`Création ${kind} KO (${r.status})`);
        return;
      }
      await pollUntilReady(kind, deviceId); // si ça finit à false, pas grave
    } finally {
      setLoadingMap((m) => {
        const copy = { ...m };
        delete copy[deviceId];
        return copy;
      });
    }
  }

  // ===== Canvas helpers
  const clientToWorld = (evt: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const gpt = pt.matrixTransform(inv);
    return { x: (gpt.x - view.x) / view.z, y: (gpt.y - view.y) / view.z };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 0.9 : 1.1;
    const m = clientToWorld(e as any);
    setView((v) => ({ z: clamp(v.z * f, 0.3, 3), x: m.x - (m.x - v.x) * f, y: m.y - (m.y - v.y) * f }));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    if (tool === "pan") {
      panRef.current = { drag: true, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    } else if (tool === "wall-line") {
      setDrawLineStart({ x1: snap(w.x, grid), y1: snap(w.y, grid) });
    } else if (tool === "wall-rect") {
      setDrawRectStart({ x: snap(w.x, grid), y: snap(w.y, grid) });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    setHover({ x: snap(w.x, grid), y: snap(w.y, grid) });
    if (panRef.current.drag) {
      const dx = (e.clientX - panRef.current.sx) / view.z;
      const dy = (e.clientY - panRef.current.sy) / view.z;
      setView((v) => ({ ...v, x: panRef.current.ox + dx, y: panRef.current.oy + dy }));
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    if (tool === "pan") {
      panRef.current.drag = false;
      return;
    }
    if (tool === "wall-line" && drawLineStart) {
      const x1 = drawLineStart.x1,
        y1 = drawLineStart.y1;
      const x2 = snap(w.x, grid),
        y2 = snap(w.y, grid);
      if (Math.hypot(x2 - x1, y2 - y1) > 5) {
        const nw: Wall = { id: uid(), x1, y1, x2, y2, thick };
        setFloors((fs) => fs.map((f) => (f.id === floor.id ? { ...f, walls: [...f.walls, nw] } : f)));
      }
      setDrawLineStart(null);
      return;
    }
    if (tool === "wall-rect" && drawRectStart) {
      const x0 = drawRectStart.x,
        y0 = drawRectStart.y;
      const x1 = snap(w.x, grid),
        y1 = snap(w.y, grid);
      const x = Math.min(x0, x1),
        y = Math.min(y0, y1);
      const wdt = Math.abs(x1 - x0),
        hgt = Math.abs(y1 - y0);
      if (wdt > 4 && hgt > 4) {
        const nb: Box = { id: uid(), x, y, w: wdt, h: hgt, thick };
        setFloors((fs) => fs.map((f) => (f.id === floor.id ? { ...f, boxes: [...f.boxes, nb] } : f)));
      }
      setDrawRectStart(null);
      return;
    }
  };

  // ----- Placement & drag des devices
  const placeNode = (kind: "porte" | "badgeuse") => (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    let x = snap(w.x, grid),
      y = snap(w.y, grid),
      rot = 0,
      hinge: Hinge = "left";
    let targetDoorId: string | undefined;
    if (kind === "porte") {
      const snapInfo = nearestWallSnap(floor.walls, x, y);
      if (snapInfo) {
        x = snap(snapInfo.x, grid);
        y = snap(snapInfo.y, grid);
        rot = snapInfo.angle;
      }
    } else if (kind === "badgeuse") {
      // 🔗 lier automatiquement à la porte la plus proche si dans le rayon
      targetDoorId = findNearestDoorDeviceId(x, y);
    }
    const nn: DeviceNode = { id: uid(), kind, x, y, rot, hinge, targetDoorId };
    setFloors((fs) => fs.map((f) => (f.id === floor.id ? { ...f, nodes: [...f.nodes, nn] } : f)));
    setSelNodeId(nn.id);
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const onNodeDown =
    (id: string) =>
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      setSelNodeId(id);
      setDragId(id);
    };
  const onNodeMove = (e: React.MouseEvent) => {
    if (!dragId) return;
    const w = clientToWorld(e);
    setFloors((fs) =>
      fs.map((f) => {
        if (f.id !== floor.id) return f;
        return {
          ...f,
          nodes: f.nodes.map((n) => {
            if (n.id !== dragId) return n;
            let x = snap(w.x, grid),
              y = snap(w.y, grid),
              rot = n.rot || 0,
              targetDoorId = n.targetDoorId;
            if (n.kind === "porte") {
              const snapInfo = nearestWallSnap(f.walls, x, y);
              if (snapInfo) {
                x = snap(snapInfo.x, grid);
                y = snap(snapInfo.y, grid);
                rot = snapInfo.angle;
              }
            } else if (n.kind === "badgeuse") {
              // 🔗 re-snap linkage si on s’approche d’une porte
              const nearest = findNearestDoorDeviceId(x, y);
              targetDoorId = nearest ?? n.targetDoorId;
            }
            return { ...n, x, y, rot, targetDoorId };
          }),
        };
      })
    );
  };
  const onNodeUp = () => setDragId(null);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawLineStart(null);
        setDrawRectStart(null);
        panRef.current.drag = false;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selNodeId) {
        setFloors((fs) =>
          fs.map((f) => (f.id === floor.id ? { ...f, nodes: f.nodes.filter((n) => n.id !== selNodeId) } : f))
        );
        setSelNodeId(null);
      }
      if ((e.key === "r" || e.key === "R") && selNodeId) {
        // flip hinge
        setFloors((fs) =>
          fs.map((f) =>
            f.id === floor.id
              ? {
                  ...f,
                  nodes: f.nodes.map((n) => (n.id === selNodeId ? { ...n, hinge: (n.hinge === "left" ? "right" : "left") as Hinge } : n)),
                }
              : f
          )
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selNodeId, floor.id]);

  // --- Statut Docker des devices
  const [dockerActive, setDockerActive] = useState<Record<string, { ready: boolean; status: string }>>({});
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const r = await fetch(`${ORCH_URL}/devices`);
        if (r.ok) {
          const arr: Array<{ id: string; kind: string; status: string; ready: boolean }> = await r.json();
          if (!stop) {
            const map: Record<string, { ready: boolean; status: string }> = {};
            for (const d of arr) map[d.id] = { ready: d.ready, status: d.status };
            setDockerActive(map);
          }
        }
      } catch {}
      if (!stop) setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, []);

  const doorIsOpen = (deviceId?: string) => (deviceId ? !!porteState[deviceId] : false);

  // ===== Rendu =====
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top bar */}
      <div className="bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-white font-semibold text-lg drop-shadow">IoT – Plan & Capteurs</div>
          <div className="ml-auto flex items-center gap-2 text-white/90">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
            <span className="text-xs hidden sm:inline">{connected ? "MQTT connecté" : "MQTT off"}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 bg-white/15 border-white/30 text-white hover:bg-white/20"
              onClick={() => setShowConn((s) => !s)}
            >
              {showConn ? (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  MQTT
                </>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 mr-1" />
                  MQTT
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 bg-white/15 border-white/30 text-white hover:bg-white/20"
              onClick={() => setShowLogs((s) => !s)}
            >
              {showLogs ? (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Logs
                </>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 mr-1" />
                  Logs
                </>
              )}
            </Button>
            <div className="w-px h-5 bg-white/40" />
            <Switch checked={dark} onCheckedChange={setDark} id="dark" />
            <label htmlFor="dark" className="text-xs">
              Dark
            </label>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-3 space-y-3">
        {showConn && (
          <Card className="rounded-xl border border-slate-200/60 dark:border-slate-800">
            <CardContent className="pt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm">MQTT WS URL</span>
              <Input
                className="max-w-md"
                value={mqttUrl}
                onChange={(e) => setMqttUrl(e.target.value)}
                placeholder="ws://localhost:9001"
              />
              <div className="text-xs opacity-70">Abonnements: iot/badgeuse/+/events, iot/porte/+/state</div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-12 gap-3">
          {/* Sidebar gauche */}
          <div className="col-span-12 md:col-span-3 space-y-3">
            <Card className="rounded-xl border">
              <CardContent className="pt-4 space-y-3">
                <div className="font-semibold">Palette</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant={tool === "pan" ? "default" : "outline"} onClick={() => setTool("pan")}>
                    <Hand className="h-4 w-4 mr-1" />
                    Pan
                  </Button>
                  <Button variant={tool === "wall-line" ? "default" : "outline"} onClick={() => setTool("wall-line")}>
                    <Ruler className="h-4 w-4 mr-1" />
                    Mur (ligne)
                  </Button>
                  <Button variant={tool === "wall-rect" ? "default" : "outline"} onClick={() => setTool("wall-rect")}>
                    <Square className="h-4 w-4 mr-1" />
                    Pièce (carré)
                  </Button>
                  <Button variant={tool === "place-porte" ? "default" : "outline"} onClick={() => setTool("place-porte")}>
                    <DoorOpen className="h-4 w-4 mr-1" />
                    Placer porte
                  </Button>
                  <Button
                    variant={tool === "place-badgeuse" ? "default" : "outline"}
                    onClick={() => setTool("place-badgeuse")}
                  >
                    <KeyRound className="h-4 w-4 mr-1" />
                    Placer badgeuse
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-70">Grille</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setGrid((g) => Math.max(2, g - 2))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="text-sm w-10 text-center">{grid}</div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setGrid((g) => Math.min(40, g + 2))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-70">Épaisseur</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setThick((t) => Math.max(2, t - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="text-sm w-10 text-center">{thick}</div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setThick((t) => Math.min(20, t + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {selNode && selNode.kind === "porte" && (
                  <div className="pt-2 border-t">
                    <div className="font-semibold mb-2">Porte sélectionnée</div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs opacity-70">Gond</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setFloors((fs) =>
                            fs.map((f) =>
                              f.id === floor.id
                                ? {
                                    ...f,
                                    nodes: f.nodes.map((n) =>
                                      n.id === selNode.id ? { ...n, hinge: (n.hinge === "left" ? "right" : "left") as Hinge } : n
                                    ),
                                  }
                                : f
                            )
                          )
                        }
                      >
                        Inverser (R)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setFloors((fs) =>
                            fs.map((f) =>
                              f.id === floor.id
                                ? { ...f, nodes: f.nodes.map((n) => (n.id === selNode.id ? { ...n, rot: (n.rot || 0) + Math.PI / 2 } : n)) }
                                : f
                            )
                          )
                        }
                      >
                        Tourner 90°
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setFloors((fs) =>
                            fs.map((f) =>
                              f.id === floor.id ? { ...f, nodes: f.nodes.map((n) => (n.id === selNode.id ? { ...n, rot: 0 } : n)) } : f
                            )
                          )
                        }
                      >
                        Reset angle
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border">
              <CardContent className="pt-4 space-y-3">
                <div className="font-semibold">Propriétés</div>
                {!selNode && <div className="text-sm opacity-70">Sélectionne une porte ou une badgeuse…</div>}
                {selNode && (
                  <div className="space-y-2">
                    <div className="text-xs opacity-70">Type</div>
                    <div className="text-sm">{selNode.kind.toUpperCase()}</div>

                    <div className="text-xs opacity-70 mt-2">deviceId</div>
                    <Input
                      value={selNode.deviceId || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFloors((fs) =>
                          fs.map((f) =>
                            f.id === floor.id
                              ? { ...f, nodes: f.nodes.map((n) => (n.id === selNode.id ? { ...n, deviceId: v } : n)) }
                              : f
                          )
                        );
                      }}
                      placeholder={selNode.kind === "porte" ? "porte-XYZ" : "badgeuse-ABC"}
                    />

                    {selNode.kind === "badgeuse" && (
                      <>
                        <div className="text-xs opacity-70 mt-2">Porte liée (deviceId)</div>
                        <Input
                          value={selNode.targetDoorId || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFloors((fs) =>
                              fs.map((f) =>
                                f.id === floor.id
                                  ? { ...f, nodes: f.nodes.map((n) => (n.id === selNode.id ? { ...n, targetDoorId: v || undefined } : n)) }
                                  : f
                              )
                            );
                          }}
                          placeholder="porte-001"
                        />
                        {/* Liste rapide des portes détectées */}
                        <div className="flex flex-wrap gap-2">
                          {floor.nodes
                            .filter((n) => n.kind === "porte" && n.deviceId)
                            .map((p) => (
                              <Button
                                key={p.id}
                                size="sm"
                                variant={p.deviceId === selNode.targetDoorId ? "default" : "outline"}
                                onClick={() =>
                                  setFloors((fs) =>
                                    fs.map((f) =>
                                      f.id === floor.id
                                        ? { ...f, nodes: f.nodes.map((n) => (n.id === selNode.id ? { ...n, targetDoorId: p.deviceId } : n)) }
                                        : f
                                    )
                                  )
                                }
                              >
                                Lier {p.deviceId}
                              </Button>
                            ))}
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 items-center">
                      <Button
                        onClick={() =>
                          selNode.deviceId
                            ? ensureService(
                                selNode.kind,
                                selNode.deviceId,
                                selNode.kind === "badgeuse" ? selNode.targetDoorId : undefined
                              )
                            : alert("Renseigne un deviceId")
                        }
                        disabled={
                          !selNode.deviceId ||
                          !!loadingMap[selNode.deviceId!] ||
                          (selNode.kind === "badgeuse" && !selNode.targetDoorId)
                        }
                        title={
                          selNode.kind === "badgeuse" && !selNode.targetDoorId
                            ? "Lie d'abord une porte (targetDoorId)"
                            : undefined
                        }
                      >
                        {selNode.deviceId && loadingMap[selNode.deviceId] ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner size={16} /> Création…
                          </span>
                        ) : (
                          "Créer / Assurer"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setFloors((fs) =>
                            fs.map((f) => (f.id === floor.id ? { ...f, nodes: f.nodes.filter((n) => n.id !== selNode.id) } : f))
                          )
                        }
                        disabled={!!(selNode.deviceId && loadingMap[selNode.deviceId])}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Supprimer
                      </Button>
                    </div>

                    {/* Actions rapides */}
                    {selNode.kind === "badgeuse" && (
                      <div>
                        <Button
                          onClick={() => badge(selNode.deviceId!, /*selNode.targetDoorId*/ undefined)}
                          disabled={!selNode.deviceId || !!loadingMap[selNode.deviceId!]}
                        >
                          {loadingMap[selNode.deviceId || ""] ? (
                            <span className="inline-flex items-center gap-2">
                              <Spinner size={16} /> Attends…
                            </span>
                          ) : (
                            "Badger TEST1234"
                          )}
                        </Button>
                      </div>
                    )}

                    {selNode.kind === "porte" && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => doorCmd(selNode.deviceId!, "open")}
                          disabled={!selNode.deviceId || !!loadingMap[selNode.deviceId!]}
                        >
                          <DoorOpen className="h-4 w-4 mr-1" />
                          Ouvrir
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => doorCmd(selNode.deviceId!, "close")}
                          disabled={!selNode.deviceId || !!loadingMap[selNode.deviceId!]}
                        >
                          <DoorClosed className="h-4 w-4 mr-1" />
                          Fermer
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => doorCmd(selNode.deviceId!, "toggle")}
                          disabled={!selNode.deviceId || !!loadingMap[selNode.deviceId!]}
                        >
                          Toggle
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Canvas */}
          <div className="col-span-12 md:col-span-9">
            <div className="rounded-xl border shadow bg-white dark:bg-slate-900 overflow-hidden select-none">
              <svg
                ref={svgRef}
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                onMouseMove={(e) => {
                  onMouseMove(e);
                  onNodeMove(e);
                }}
                onMouseUp={(e) => {
                  onMouseUp(e);
                  onNodeUp();
                }}
                onClick={(e) => {
                  if (tool === "place-porte") placeNode("porte")(e);
                  if (tool === "place-badgeuse") placeNode("badgeuse")(e);
                }}
                width="100%"
                height="720"
                viewBox={`0 0 ${floor.width} ${floor.height}`}
                style={{
                  backgroundSize: `${grid}px ${grid}px`,
                  backgroundImage:
                    "linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)",
                }}
              >
                <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
                  {/* Boxes */}
                  {floor.boxes.map((b) => (
                    <rect
                      key={b.id}
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      fill="rgba(148,163,184,0.08)"
                      stroke="#0f172a"
                      strokeWidth={b.thick || thick}
                      rx={2}
                    />
                  ))}

                  {/* Walls */}
                  {floor.walls.map((w) => (
                    <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#0f172a" strokeWidth={w.thick || thick} strokeLinecap="round" />
                  ))}

                  {/* Lignes de liaison badgeuse → porte */}
                  {floor.nodes
                    .filter((n) => n.kind === "badgeuse" && n.targetDoorId)
                    .map((b) => {
                      const door = floor.nodes.find((d) => d.kind === "porte" && d.deviceId === b.targetDoorId);
                      if (!door) return null;
                      return (
                        <line
                          key={`link-${b.id}-${door.id}`}
                          x1={b.x}
                          y1={b.y}
                          x2={door.x}
                          y2={door.y}
                          stroke="#38bdf8"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          opacity={0.7}
                        />
                      );
                    })}

                  {/* Previews */}
                  {drawLineStart && hover && (
                    <line
                      x1={drawLineStart.x1}
                      y1={drawLineStart.y1}
                      x2={hover.x}
                      y2={hover.y}
                      stroke="#38bdf8"
                      strokeDasharray="6 6"
                      strokeWidth={thick}
                    />
                  )}
                  {drawRectStart && hover && (
                    <rect
                      x={Math.min(drawRectStart.x, hover.x)}
                      y={Math.min(drawRectStart.y, hover.y)}
                      width={Math.abs(hover.x - drawRectStart.x)}
                      height={Math.abs(hover.y - drawRectStart.y)}
                      fill="rgba(56,189,248,0.12)"
                      stroke="#38bdf8"
                      strokeDasharray="6 6"
                      strokeWidth={thick}
                    />
                  )}

                  {/* Nodes */}
                  {floor.nodes.map((n) => {
                    const isLoading = !!(n.deviceId && loadingMap[n.deviceId]);
                    const dockerOk = n.deviceId ? dockerActive[n.deviceId]?.ready : false;
                    return (
                      <g
                        key={n.id}
                        transform={`translate(${n.x} ${n.y})`}
                        onMouseDown={onNodeDown(n.id)}
                        style={{ cursor: "grab" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelNodeId(n.id);
                        }}
                      >
                        {n.kind === "porte" ? (
                          <DoorGlyph
                            angle={n.rot || 0}
                            open={n.deviceId ? !!porteState[n.deviceId] : false}
                            hinge={n.hinge || "left"}
                            label={n.deviceId || "porte"}
                          />
                        ) : (
                          <g>
                            <circle r={10} fill="#0284c7" />
                            <text x={0} y={-14} fontSize={10} textAnchor="middle" fill="#334155">
                              {n.deviceId || "badgeuse"}
                            </text>
                            {n.targetDoorId && (
                              <text x={0} y={14} fontSize={9} textAnchor="middle" fill="#64748b">
                                → {n.targetDoorId}
                              </text>
                            )}
                          </g>
                        )}

                        {/* Anneau état docker */}
                        {n.deviceId && (
                          <circle
                            r={18}
                            fill="none"
                            stroke={dockerOk ? "#10b981" : "#ef4444"}
                            strokeWidth={2}
                            opacity={0.9}
                          />
                        )}

                        {/* Sélection */}
                        {selNodeId === n.id && <circle r={16} fill="none" stroke="#38bdf8" strokeDasharray="4 4" />}
                        {/* Overlay loading */}
                        {isLoading && (
                          <g>
                            <circle r={14} fill="rgba(15,23,42,0.35)" />
                            <foreignObject x={-8} y={-8} width={16} height={16}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "16px",
                                  height: "16px",
                                  color: "white",
                                }}
                              >
                                <Spinner size={14} />
                              </div>
                            </foreignObject>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>
        </div>

        {showLogs && (
          <Card className="rounded-xl border">
            <CardContent className="pt-4">
              <div className="text-sm font-medium mb-2">
                Logs MQTT (dernier en haut) — ESC annule le tracé, Suppr supprime l'élément, R inverse les gonds
              </div>
              <div className="max-h-64 overflow-auto text-xs font-mono bg-white dark:bg-slate-900 rounded-lg border">
                {logs.map((l, i) => (
                  <div key={i} className="px-3 py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="opacity-60 mr-2">{new Date(l.ts).toLocaleTimeString()}</span>
                    <span className="mr-2">{l.topic}</span>
                    <span className="opacity-80">{l.payload}</span>
                  </div>
                ))}
                {!logs.length && <div className="px-3 py-6 text-center opacity-60">Aucun log…</div>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ====== Glyphes ======
type HingeProp = Hinge;
function DoorGlyph({ angle, open, hinge, label }: { angle: number; open: boolean; hinge: HingeProp; label: string }) {
  // largeur de l'embrasure et longueur du battant
  const jamb = 36; // embrasure
  const leaf = 34; // battant
  const leafThickness = 4;
  const openAngle = hinge === "left" ? -85 : 85; // sens d'ouverture

  return (
    <g transform={`rotate(${(angle * 180) / Math.PI})`}>
      {/* chambranle (barre sur le mur) */}
      <rect x={-jamb / 2} y={-leafThickness / 2} width={jamb} height={leafThickness} fill="#0f172a" rx={2} />

      {/* battant animé autour du pivot (0,0) */}
      <motion.rect
        initial={false}
        animate={{ rotate: open ? openAngle : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        x={0}
        y={-leafThickness / 2}
        width={leaf}
        height={leafThickness}
        fill="#22c55e"
        rx={2}
        style={{ transformOrigin: "0px 0px" }}
      />

      {/* arc d'ouverture (indicatif) */}
      <path
        d={`M0 0 A ${leaf} ${leaf} 0 0 ${hinge === "left" ? 1 : 0} ${
          Math.cos(((open ? openAngle : 0) * Math.PI) / 180) * leaf
        } ${Math.sin(((open ? openAngle : 0) * Math.PI) / 180) * leaf}`}
        stroke="#22c55e"
        strokeDasharray="3 4"
        fill="none"
        opacity={0.3}
      />

      {/* label */}
      <text
        x={0}
        y={-10}
        fontSize={10}
        textAnchor="middle"
        fill="#334155"
        transform={`rotate(${-(angle * 180) / Math.PI}) translate(0 0)`}
      >
        {label}
      </text>
    </g>
  );
}

// ===== Helpers actions rapides =====
async function badge(id: string, doorId?: string) {
  if (!id) return;
  const body: any = { tag_id: "TEST1234", success: true };
  // Option : si tu veux pousser aussi au service HTTP (en plus de DOOR_ID env)
  // if (doorId) body.door_id = doorId;
  const r = await fetch(`${ORCH_URL}/badge/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) alert(`Badge KO (${r.status})`);
}

async function doorCmd(id: string, action: "open" | "close" | "toggle") {
  if (!id) return;
  const r = await fetch(`${ORCH_URL}/door/${id}/${action}`, { method: "POST" });
  if (!r.ok) alert(`Door ${action} KO (${r.status})`);
}
