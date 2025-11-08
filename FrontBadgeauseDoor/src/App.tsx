import React, { useEffect, useRef, useState, useMemo } from "react";
import mqtt from "mqtt";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Wifi,
  Server,
  KeyRound,
  DoorOpen,
  DoorClosed,
  RefreshCw,
  Check,
  X,
  PlugZap,
  PlusCircle,
  ListFilter,
} from "lucide-react";

/**
 * FRONT REACT — MQTT (WebSocket) + Orchestrateur HTTP (v4)
 * - ⚠️ Plus d'URL par capteur dans l'UI
 * - Le front parle UNIQUEMENT à l'orchestrateur (http://localhost:9002)
 *   * POST /devices {kind, device_id} -> crée un conteneur et renvoie ses infos
 *   * GET  /devices -> liste des capteurs (id, kind, status)
 *   * POST /badge/{id} -> proxy vers la badgeuse {id}
 *   * POST /door/{id}/{open|close|toggle} -> proxy vers la porte {id}
 */

const ORCH_URL = import.meta.env.VITE_ORCH_URL || "http://localhost:9002";
const MQTT_WS_URL_DEFAULT = "ws://localhost:9001";
const STORAGE_KEY = "iot-front-v4";

// ------------------------------------------------------------------------

interface BadgeEventPayload { device_id: string; type: "badge_event"; ts: string; data: { tag_id: string; success: boolean }; }
interface DoorStatePayload { device_id: string; type: "door_state"; ts: string; data: { is_open: boolean }; }

type DeviceRow = { id: string; kind: "badgeuse"|"porte"; status: string };

type LogEntry = { ts: number; topic: string; payload: string };

const fmt = (iso?: string) => { try { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleString(); } catch { return iso || "—"; } };

const Topic = { parse(full: string) { const parts = full.split("/"); if (parts.length < 4) return null as | { root: string; kind: "badgeuse"|"porte"; id: string; leaf: string } | null; const [, kind, id, leaf] = parts; if (kind !== "badgeuse" && kind !== "porte") return null; return { root: "iot", kind, id, leaf } as const; }, };

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate"|"emerald"|"amber"|"sky" }) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs ${map[tone]}`}>{children}</span>;
}

function Toast({ show, tone = "ok", text }: { show: boolean; tone?: "ok"|"err"; text: string }) {
  if (!show) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm ${tone === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
      {text}
    </div>
  );
}

export default function App() {
  // Persisted prefs -------------------------------------------------------
  const persisted = useMemo(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; } catch { return {}; } }, []);
  const [mqttUrl, setMqttUrl] = useState<string>(persisted.mqttUrl || MQTT_WS_URL_DEFAULT);
  const [dark, setDark] = useState<boolean>(persisted.dark ?? false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mqttUrl, dark })); }, [mqttUrl, dark]);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  // Orchestrateur state ---------------------------------------------------
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<"badgeuse"|"porte">("badgeuse");
  const [newId, setNewId] = useState("");

  async function refreshDevices() {
    const res = await fetch(`${ORCH_URL}/devices`);
    if (res.ok) setDevices(await res.json());
  }

  async function createDevice() {
    if (!newId) return showToast("Donne un device_id", "err");
    setCreating(true);
    const res = await fetch(`${ORCH_URL}/devices`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ kind: newKind, device_id: newId }) });
    setCreating(false);
    if (!res.ok) { showToast(`Erreur création (${res.status})`, "err"); return; }
    setNewId("");
    showToast("Capteur créé");
    refreshDevices();
  }

  // Device data via MQTT --------------------------------------------------
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const [badgeuses, setBadgeuses] = useState<Record<string, BadgeEventPayload | null>>({});
  const [portes, setPortes] = useState<Record<string, DoorStatePayload | null>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPaused, setLogPaused] = useState(false);
  const [logFilter, setLogFilter] = useState("");
  const [toast, setToast] = useState<{show: boolean; tone: "ok"|"err"; text: string}>({show:false, tone:"ok", text:""});
  const showToast = (text: string, tone: "ok"|"err" = "ok") => { setToast({show:true, tone, text}); setTimeout(()=>setToast({show:false, tone, text:""}), 1600); };

  useEffect(() => { refreshDevices(); }, []);

  useEffect(() => {
    if (clientRef.current) { try { clientRef.current.end(true); } catch {}; clientRef.current = null; }
    const client = mqtt.connect(mqttUrl, { reconnectPeriod: autoReconnect ? 2000 : 0 });
    clientRef.current = client;
    client.on("connect", () => { setConnected(true); showToast("MQTT connecté"); client.subscribe("iot/badgeuse/+/events", {qos:1}); client.subscribe("iot/porte/+/state", {qos:1}); });
    client.on("reconnect", () => setConnected(false));
    client.on("close", () => setConnected(false));
    client.on("error", () => { setConnected(false); showToast("Erreur MQTT", "err"); });
    client.on("message", (topic, payload) => {
      if (!logPaused) setLogs((prev) => [{ ts: Date.now(), topic, payload: payload.toString() }, ...prev].slice(0, 300));
      const meta = Topic.parse(topic); if (!meta) return;
      try { const obj = JSON.parse(payload.toString()); if (meta.kind === "badgeuse" && meta.leaf === "events") setBadgeuses(p=>({ ...p, [meta.id]: obj as BadgeEventPayload })); if (meta.kind === "porte" && meta.leaf === "state") setPortes(p=>({ ...p, [meta.id]: obj as DoorStatePayload })); } catch {}
    });
    return () => { try { client.end(true); } catch {}; clientRef.current = null; };
  }, [mqttUrl, autoReconnect]);

  // Actions via ORCHESTRATEUR --------------------------------------------
  const triggerBadge = async (id: string, tag: string) => {
    const res = await fetch(`${ORCH_URL}/badge/${id}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ tag_id: tag, success: true }) });
    if (!res.ok) return showToast(`Erreur badge (${res.status})`, "err");
    showToast("Badge envoyé");
  };
  const doorCmdHttp = async (id: string, action: "open"|"close"|"toggle") => {
    const res = await fetch(`${ORCH_URL}/door/${id}/${action}`, { method: "POST" });
    if (!res.ok) return showToast(`Erreur porte (${res.status})`, "err");
    showToast(`Porte ${action}`);
  };
  const doorCmdMqtt = (id: string, action: "open"|"close"|"toggle") => {
    const c = clientRef.current; if (!c) return; c.publish(`iot/porte/${id}/commands`, JSON.stringify({ action }), { qos: 1 }); showToast(`MQTT → ${action}`);
  };

  const filteredLogs = logs.filter(l => !logFilter || l.topic.includes(logFilter) || l.payload.includes(logFilter));

  // Cartes ---------------------------------------------------------------
  const badgeuseCards = devices.filter(d=>d.kind==='badgeuse').map(({id}) => (
    <motion.div key={id} initial={{opacity:0, y:6}} animate={{opacity:1, y:0}}>
      <Card className="rounded-2xl shadow hover:shadow-lg transition-shadow border border-slate-200/60 dark:border-slate-800">
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-sky-500" />
              <div className="text-lg font-semibold">Badgeuse</div>
              <Pill tone="sky">{id}</Pill>
            </div>
            <div className="flex items-center gap-2 text-sm opacity-70">
              <span>dernier événement</span>
              <Pill>{fmt(badgeuses[id]?.ts)}</Pill>
            </div>
          </div>

          <div className="text-sm">
            {badgeuses[id] ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="opacity-70">Dernier tag</div>
                <div className="font-mono font-medium">{badgeuses[id]?.data.tag_id}</div>
                <div className="opacity-70">Succès</div>
                <div className="flex items-center gap-2">{badgeuses[id]?.data.success ? <><Check className="h-4 w-4 text-emerald-500"/>Validé</> : <><X className="h-4 w-4 text-rose-500"/>Refusé</>}</div>
              </div>
            ) : (
              <div className="opacity-60 italic">En attente d'un premier badge…</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input className="max-w-xs" placeholder="TAG (ex: TEST1234)" defaultValue="TEST1234" id={`tag-${id}`} />
            <Button onClick={() => { const tagInput = document.getElementById(`tag-${id}`) as HTMLInputElement | null; triggerBadge(id, tagInput?.value || "TEST1234"); }}>Badger</Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  ));

  const porteCards = devices.filter(d=>d.kind==='porte').map(({id}) => {
    const st = portes[id];
    return (
      <motion.div key={id} initial={{opacity:0, y:6}} animate={{opacity:1, y:0}}>
        <Card className="rounded-2xl shadow hover:shadow-lg transition-shadow border border-slate-200/60 dark:border-slate-800">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {st?.data.is_open ? <DoorOpen className="h-5 w-5 text-emerald-500"/> : <DoorClosed className="h-5 w-5 text-slate-500"/>}
                <div className="text-lg font-semibold">Porte</div>
                <Pill>{id}</Pill>
              </div>
              <div className="flex items-center gap-2 text-sm opacity-70">
                <span>état reçu</span>
                <Pill>{fmt(st?.ts)}</Pill>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Pill tone={st?.data.is_open ? "emerald" : "slate"}>
                {st?.data.is_open ? "OUVERTE" : "FERMÉE"}
              </Pill>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => doorCmdHttp(id, "open")}><DoorOpen className="h-4 w-4 mr-1"/>Ouvrir (HTTP)</Button>
              <Button onClick={() => doorCmdHttp(id, "close")} variant="secondary"><DoorClosed className="h-4 w-4 mr-1"/>Fermer (HTTP)</Button>
              <Button onClick={() => doorCmdHttp(id, "toggle")} variant="outline"><RefreshCw className="h-4 w-4 mr-1"/>Toggle (HTTP)</Button>
              <Button onClick={() => doorCmdMqtt(id, "open")} variant="outline"><PlugZap className="h-4 w-4 mr-1"/>Ouvrir (MQTT)</Button>
              <Button onClick={() => doorCmdMqtt(id, "close")} variant="outline"><PlugZap className="h-4 w-4 mr-1 rotate-180"/>Fermer (MQTT)</Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100">
      <Toast show={toast.show} tone={toast.tone} text={toast.text} />

      {/* Header */}
      <div className="bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <motion.h1 initial={{opacity:0, y:-6}} animate={{opacity:1, y:0}} className="text-3xl font-bold tracking-tight text-white drop-shadow">
              IoT Demo — Badgeuses & Portes
            </motion.h1>
            <div className="flex items-center gap-3 bg-white/15 backdrop-blur px-3 py-2 rounded-xl text-white">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
              <span className="text-sm">{connected ? "Connecté" : "Déconnecté"}</span>
              <div className="w-px h-5 bg-white/30 mx-1" />
              <Switch checked={dark} onCheckedChange={setDark} id="dark" />
              <label htmlFor="dark" className="text-sm">Dark</label>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Connexion */}
        <Card className="rounded-2xl shadow border border-slate-200/60 dark:border-slate-800">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
              <div className="lg:col-span-2">
                <div className="text-sm font-medium flex items-center gap-2"><Wifi className="h-4 w-4"/> MQTT WebSocket URL</div>
                <div className="mt-2 flex gap-2">
                  <Input value={mqttUrl} onChange={(e) => setMqttUrl(e.target.value)} placeholder="ws://host:9001" />
                  <Button variant="outline" onClick={() => setMqttUrl(MQTT_WS_URL_DEFAULT)} title="Remettre la valeur par défaut">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Pill tone={connected ? "emerald" : "slate"}>
                  <span className="inline-flex items-center gap-1">{connected ? <Check className="h-4 w-4"/> : <X className="h-4 w-4"/>}{connected ? "Connecté" : "Déconnecté"}</span>
                </Pill>
                <div className="flex items-center gap-2 ml-auto">
                  <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} id="reco" />
                  <label htmlFor="reco" className="text-sm">Auto-reconnect</label>
                </div>
              </div>
            </div>
            <div className="text-xs opacity-70 flex items-center gap-2">
              <Server className="h-3.5 w-3.5"/>
              Abonnements: <code>iot/badgeuse/+/events</code>, <code>iot/porte/+/state</code>
            </div>
          </CardContent>
        </Card>

        {/* Nouveau capteur via orchestrateur */}
        <Card className="rounded-2xl shadow border border-slate-200/60 dark:border-slate-800">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-emerald-600"/>
              <div className="text-lg font-semibold">Nouveau capteur</div>
            </div>
            <div className="grid md:grid-cols-3 gap-2">
              <select value={newKind} onChange={(e)=>setNewKind(e.target.value as any)} className="border rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-900/40">
                <option value="badgeuse">Badgeuse</option>
                <option value="porte">Porte</option>
              </select>
              <Input value={newId} onChange={(e)=>setNewId(e.target.value)} placeholder="ex: badgeuse-002" />
              <Button onClick={createDevice} disabled={creating}>{creating ? "Création…" : "Créer"}</Button>
            </div>
            <div className="text-xs opacity-70">L'orchestrateur crée le conteneur et l'API. Aucun champ URL n'est nécessaire dans l'UI.</div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-sky-500"/>
              <h2 className="text-xl font-semibold">Badgeuses</h2>
            </div>
            {badgeuseCards.length ? badgeuseCards : (
              <EmptyState icon={<KeyRound className="h-6 w-6 text-slate-400"/>} text="Aucune badgeuse détectée pour l'instant. Déclenche un badge pour apparaître ici." />
            )}
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <DoorClosed className="h-5 w-5 text-amber-500"/>
              <h2 className="text-xl font-semibold">Portes</h2>
            </div>
            {porteCards.length ? porteCards : (
              <EmptyState icon={<DoorClosed className="h-6 w-6 text-slate-400"/>} text="Aucune porte détectée pour l'instant. Envoie une commande ou attends un publish d'état." />
            )}
          </div>
        </div>

        {/* Logs */}
        <Card className="rounded-2xl shadow border border-slate-200/60 dark:border-slate-800">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><ListFilter className="h-5 w-5"/> Logs MQTT (dernier en haut)</div>
              <div className="flex items-center gap-2">
                <Input value={logFilter} onChange={(e)=>setLogFilter(e.target.value)} placeholder="filtrer par topic/payload" className="h-8"/>
                <Button variant="outline" onClick={()=>setLogPaused(p=>!p)}>{logPaused ? "Reprendre" : "Pause"}</Button>
                <Button variant="outline" onClick={()=>setLogs([])}>Clear</Button>
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border bg-white/60 dark:bg-slate-900/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left sticky top-0 bg-white/80 dark:bg-slate-900/80">
                    <th className="px-3 py-2 w-40">Heure</th>
                    <th className="px-3 py-2 w-96">Topic</th>
                    <th className="px-3 py-2">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l, i) => (
                    <tr key={i} className="border-t border-slate-200/70 dark:border-slate-800">
                      <td className="px-3 py-1 whitespace-nowrap">{new Date(l.ts).toLocaleTimeString()}</td>
                      <td className="px-3 py-1 font-mono truncate" title={l.topic}>{l.topic}</td>
                      <td className="px-3 py-1 font-mono" title={l.payload}>{l.payload}</td>
                    </tr>
                  ))}
                  {!filteredLogs.length && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center opacity-60">Aucun log pour l’instant…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>

      <footer className="text-xs text-center py-8 opacity-60">Fait avec ❤ — Orchestrateur, MQTT, FastAPI, React</footer>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="border border-dashed rounded-2xl p-8 text-sm text-center bg-white/50 dark:bg-slate-900/30 border-slate-300/70 dark:border-slate-700/70">
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="opacity-80">{text}</div>
    </div>
  );
}
