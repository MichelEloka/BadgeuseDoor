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
  Ruler,
  Save,
  MapPinned,
  Plus,
  Hand,
  PanelsTopLeft,
  Move,
  FolderOpen,
} from "lucide-react";

/**
 * FloorPlanPage — Vue plan d'étage (SVG)
 * - Dessiner les murs (segments)
 * - Poser portes & badgeuses (drag & drop)
 * - Lier un deviceId existant (badgeuse-X / porte-Y)
 * - Animer l'ouverture des portes en temps-réel via MQTT
 * - Sauvegarder/charger le plan via l'orchestrateur (/plans)
 */

// ====== CONFIG ======
const ORCH_URL = import.meta.env.VITE_ORCH_URL || "http://localhost:9002";
const MQTT_WS_URL_DEFAULT = "ws://localhost:9001";

// ====== Types ======
export type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; thick?: number };
export type DevicePin = { id: string; kind: "porte" | "badgeuse"; deviceId: string; x: number; y: number; rot?: number };
export type Floor = { id: string; name: string; width: number; height: number; walls: Wall[]; devices: DevicePin[] };

// MQTT payloads
interface DoorStatePayload { device_id: string; type: "door_state"; ts: string; data: { is_open: boolean } }
interface BadgeEventPayload { badgeID: string; doorID?: string; timestamp: string; deviceId?: string }

const parseBadgeEvent = (raw: unknown, deviceId: string): BadgeEventPayload | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, any>;
  if ("badgeID" in data || "doorID" in data) {
    return {
      badgeID: String(data.badgeID ?? ""),
      doorID: data.doorID ? String(data.doorID) : undefined,
      timestamp: String(data.timestamp ?? new Date().toISOString()),
      deviceId,
    };
  }
  if (data.type === "badge_event") {
    const inner = (data.data as Record<string, any>) || {};
    return {
      badgeID: String(inner.badge_id ?? inner.tag_id ?? ""),
      doorID: inner.door_id ? String(inner.door_id) : undefined,
      timestamp: String(data.ts ?? data.timestamp ?? new Date().toISOString()),
      deviceId,
    };
  }
  return null;
};

// ====== Utils ======
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snap = (v: number, grid = 10) => Math.round(v / grid) * grid;

// ====== Component ======
export default function FloorPlanPage() {
  // Plans ---------------------------------------------------------------
  const [floors, setFloors] = useState<Floor[]>([{
    id: "etage-1", name: "Étage 1", width: 1200, height: 800,
    walls: [ { id: uid(), x1: 50, y1: 50, x2: 1150, y2: 50, thick: 8 }, { id: uid(), x1: 1150, y1: 50, x2: 1150, y2: 750, thick: 8 }, { id: uid(), x1: 1150, y1: 750, x2: 50, y2: 750, thick: 8 }, { id: uid(), x1: 50, y1: 750, x2: 50, y2: 50, thick: 8 } ],
    devices: []
  }]);
  const [selFloorId, setSelFloorId] = useState<string>("etage-1");
  const floor = useMemo(() => floors.find(f => f.id === selFloorId)!, [floors, selFloorId]);

  // Outils --------------------------------------------------------------
  type Tool = "pan" | "wall" | "place-porte" | "place-badgeuse" | "select";
  const [tool, setTool] = useState<Tool>("pan");
  const [grid, setGrid] = useState(10);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const panRef = useRef<{ dragging: boolean; sx: number; sy: number; ox: number; oy: number }>({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [drawing, setDrawing] = useState<{ x1: number; y1: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [newDeviceId, setNewDeviceId] = useState("");

  // MQTT ---------------------------------------------------------------
  const [mqttUrl, setMqttUrl] = useState(MQTT_WS_URL_DEFAULT);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const [porteState, setPorteState] = useState<Record<string, boolean>>({});
  const [lastBadge, setLastBadge] = useState<Record<string, BadgeEventPayload>>({});

  useEffect(() => {
    if (clientRef.current) { try { clientRef.current.end(true); } catch {} clientRef.current = null; }
    const c = mqtt.connect(mqttUrl, { reconnectPeriod: 2000 });
    clientRef.current = c;
    c.on("connect", () => { setConnected(true); c.subscribe("iot/porte/+/state", { qos: 1 }); c.subscribe("iot/badgeuse/+/events", { qos: 1 }); });
    c.on("reconnect", () => setConnected(false));
    c.on("close", () => setConnected(false));
    c.on("message", (topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString());
        if (topic.startsWith("iot/porte/")) {
          const id = msg.device_id as string; setPorteState(p => ({ ...p, [id]: !!msg.data?.is_open }));
        } else if (topic.startsWith("iot/badgeuse/")) {
          const deviceId = topic.split("/")[2] ?? "";
          const event = parseBadgeEvent(msg, deviceId);
          if (event && deviceId) setLastBadge(p => ({ ...p, [deviceId]: event }));
        }
      } catch {}
    });
    return () => { try { c.end(true); } catch {} };
  }, [mqttUrl]);

  // Orchestrateur (save/load plans) ------------------------------------
  async function savePlan() {
    const res = await fetch(`${ORCH_URL}/plans/${floor.id}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(floor) });
    if (!res.ok) alert(`Save KO: ${res.status}`);
  }
  async function loadPlans() {
    const res = await fetch(`${ORCH_URL}/plans`);
    if (!res.ok) return;
    const all: Floor[] = await res.json();
    if (all?.length) { setFloors(all); setSelFloorId(all[0].id); }
  }
  useEffect(() => { loadPlans().catch(()=>{}); }, []);

  // Interaction helpers -------------------------------------------------
  const clientToWorld = (evt: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const gpt = pt.matrixTransform(inv);
    return { x: (gpt.x - view.x) / view.z, y: (gpt.y - view.y) / view.z };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const mouse = clientToWorld(e as any);
    setView(v => ({
      z: clamp(v.z * factor, 0.3, 3),
      x: mouse.x - (mouse.x - v.x) * factor,
      y: mouse.y - (mouse.y - v.y) * factor,
    }));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    if (tool === "pan") {
      panRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    } else if (tool === "wall") {
      setDrawing({ x1: snap(w.x, grid), y1: snap(w.y, grid) });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    setHover({ x: snap(w.x, grid), y: snap(w.y, grid) });
    if (panRef.current.dragging) {
      const dx = (e.clientX - panRef.current.sx) / view.z;
      const dy = (e.clientY - panRef.current.sy) / view.z;
      setView(v => ({ ...v, x: panRef.current.ox + dx, y: panRef.current.oy + dy }));
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const w = clientToWorld(e);
    if (tool === "pan") {
      panRef.current.dragging = false;
    } else if (tool === "wall" && drawing) {
      const x1 = drawing.x1, y1 = drawing.y1;
      const x2 = snap(w.x, grid), y2 = snap(w.y, grid);
      if (Math.hypot(x2 - x1, y2 - y1) > 5) {
        const nw: Wall = { id: uid(), x1, y1, x2, y2, thick: 8 };
        setFloors(fs => fs.map(f => f.id === floor.id ? { ...f, walls: [...f.walls, nw] } : f));
      }
      setDrawing(null);
    }
  };

  // Placement devices ---------------------------------------------------
  const placeDevice = (kind: "porte"|"badgeuse") => (e: React.MouseEvent) => {
    if (!(tool === "place-porte" || tool === "place-badgeuse")) return;
    if (!newDeviceId) return alert("Renseigne un deviceId existant (ex: porte-001)");
    const w = clientToWorld(e);
    const nd: DevicePin = { id: uid(), kind, deviceId: newDeviceId, x: snap(w.x, grid), y: snap(w.y, grid), rot: 0 };
    setFloors(fs => fs.map(f => f.id === floor.id ? { ...f, devices: [...f.devices, nd] } : f));
  };

  // Drag devices --------------------------------------------------------
  const [dragId, setDragId] = useState<string | null>(null);
  const onDeviceMouseDown = (id: string) => (e: React.MouseEvent) => { e.stopPropagation(); setDragId(id); };
  const onDeviceMouseMove = (e: React.MouseEvent) => {
    if (!dragId) return;
    const w = clientToWorld(e);
    setFloors(fs => fs.map(f => f.id === floor.id ? { ...f, devices: f.devices.map(d => d.id === dragId ? { ...d, x: snap(w.x, grid), y: snap(w.y, grid) } : d) } : f));
  };
  const onDeviceMouseUp = () => setDragId(null);

  // Render helpers ------------------------------------------------------
  const doorIsOpen = (deviceId: string) => !!porteState[deviceId];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <PanelsTopLeft className="h-5 w-5"/>
          <div className="text-xl font-semibold">Plan d'étage</div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="text-xs">{connected ? "MQTT ok" : "MQTT off"}</span>
            <Input className="h-8 w-56" value={mqttUrl} onChange={e=>setMqttUrl(e.target.value)} />
          </div>
        </div>

        {/* Toolbar */}
        <Card className="rounded-2xl shadow border">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4"/>
                <select className="border rounded-xl px-2 py-1" value={selFloorId} onChange={e=>setSelFloorId(e.target.value)}>
                  {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div className="w-px h-6 bg-slate-200"/>

              <Button variant={tool==="pan"?"default":"outline"} onClick={()=>setTool("pan")}><Hand className="h-4 w-4 mr-1"/>Pan</Button>
              <Button variant={tool==="wall"?"default":"outline"} onClick={()=>setTool("wall")}><Ruler className="h-4 w-4 mr-1"/>Mur</Button>

              <div className="w-px h-6 bg-slate-200"/>

              <Input placeholder="deviceId (ex: porte-001)" className="h-8 w-52" value={newDeviceId} onChange={e=>setNewDeviceId(e.target.value)}/>
              <Button variant={tool==="place-porte"?"default":"outline"} onClick={()=>setTool("place-porte")}><DoorOpen className="h-4 w-4 mr-1"/>Placer porte</Button>
              <Button variant={tool==="place-badgeuse"?"default":"outline"} onClick={()=>setTool("place-badgeuse")}><KeyRound className="h-4 w-4 mr-1"/>Placer badgeuse</Button>

              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" onClick={savePlan}><Save className="h-4 w-4 mr-1"/>Sauvegarder</Button>
                <Button variant="outline" onClick={loadPlans}><FolderOpen className="h-4 w-4 mr-1"/>Charger</Button>
                <div className="text-xs opacity-70">Grid</div>
                <Input type="number" className="h-8 w-20" value={grid} onChange={e=>setGrid(Math.max(2, Number(e.target.value)||10))}/>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Canvas */}
        <div className="rounded-2xl border shadow bg-white dark:bg-slate-900 overflow-hidden select-none">
          <svg
            ref={svgRef}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={(e)=>{onMouseMove(e); onDeviceMouseMove(e);}}
            onMouseUp={(e)=>{onMouseUp(e); onDeviceMouseUp();}}
            onClick={(e)=>{
              if (tool === "place-porte") placeDevice("porte")(e);
              if (tool === "place-badgeuse") placeDevice("badgeuse")(e);
            }}
            width="100%" height="700" viewBox={`0 0 ${floor.width} ${floor.height}`}
            style={{ backgroundSize: `${grid}px ${grid}px`, backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)` }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
              {/* walls */}
              {floor.walls.map(w => (
                <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#0f172a" strokeWidth={w.thick||6} strokeLinecap="round"/>
              ))}

              {/* drawing preview */}
              {drawing && hover && (
                <line x1={drawing.x1} y1={drawing.y1} x2={hover.x} y2={hover.y} stroke="#38bdf8" strokeDasharray={"6 6"} strokeWidth={4} />
              )}

              {/* devices */}
              {floor.devices.map(d => (
                <g key={d.id} transform={`translate(${d.x} ${d.y})`} onMouseDown={onDeviceMouseDown(d.id)} style={{ cursor: "grab" }}>
                  {d.kind === "porte" ? (
                    <g>
                      {/* chambranle */}
                      <rect x={-18} y={-4} width={36} height={8} fill="#0f172a" rx={2} />
                      {/* battant animé */}
                      <motion.rect
                        initial={false}
                        animate={{ rotate: doorIsOpen(d.deviceId) ? -85 : 0 }}
                        transition={{ type: "spring", stiffness: 140, damping: 16 }}
                        x={0} y={-2} width={34} height={4} fill="#22c55e" rx={2}
                        transformOrigin="0px 0px"
                      />
                      <text x={0} y={-10} fontSize={10} textAnchor="middle" fill="#334155">{d.deviceId}</text>
                    </g>
                  ) : (
                    <g>
                      <circle r={10} fill="#0284c7" />
                      <text x={0} y={-14} fontSize={10} textAnchor="middle" fill="#334155">{d.deviceId}</text>
                    </g>
                  )}
                </g>
              ))}
            </g>
          </svg>
        </div>

        <div className="text-xs opacity-70">Astuce: Zommer avec la molette, déplacer le plan (outil Pan), clic pour placer un élément, glisser pour déplacer.</div>
      </div>
    </div>
  );
}
