import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteDeviceOnOrch, doorCmd, fetchPlan, pollUntilReady, savePlan } from "@/api/orchestrator";
import { createMockDevice, deleteMockDevice, fetchMockDevices, fetchMockUsers, type MockDeviceRecord, type MockUser } from "@/api/mockDirectory";
import { ORCH_URL, MQTT_WS_URL_DEFAULT } from "@/config";
import { useDockerStatus } from "@/hooks/useDockerStatus";
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect";
import { useMqttBridge } from "@/hooks/useMqttBridge";
import { MqttSettingsCard } from "./components/MqttSettingsCard";
import { PalettePanel } from "./components/PalettePanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SimulationPanel } from "./components/SimulationPanel";
import { TopBar } from "./components/TopBar";
import { CanvasBoard } from "./components/CanvasBoard";
import { LogsPanel } from "./components/LogsPanel";
import { ZonesPanel } from "./components/ZonesPanel";
import type { DeviceNode, Floor, Hinge, Wall, SimPerson, ZonePoint, ZoneShape } from "@/types/floor";
import { distancePointToPolygon, pointInPolygon, uid } from "@/utils/geometry";
import type { Tool } from "./types";

export default function WorkspacePage() {
  const [showConn, setShowConn] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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
        { id: uid(), x1: 400, y1: 80, x2: 400, y2: 300, thick: 8 },
      ],
      nodes: [],
      simPersons: [],
      zones: [],
    },
  ]);
  const [selFloorId] = useState("etage-1");
  const floor = useMemo(() => floors.find((f) => f.id === selFloorId)!, [floors, selFloorId]);
  const simPersons = floor.simPersons ?? [];
  const zones = floor.zones ?? [];
  const [showZoneWalls, setShowZoneWalls] = useState(false);
  const [showZoneFill, setShowZoneFill] = useState(true);

  const [badgeCatalog, setBadgeCatalog] = useState<MockUser[]>([]);
  const [deviceRegistry, setDeviceRegistry] = useState<MockDeviceRecord[]>([]);
  const doorCatalog = useMemo(() => deviceRegistry.filter((d) => d.type === "porte").map((d) => d.id), [deviceRegistry]);

  useEffect(() => {
    (async () => {
      try {
        const fetched = await fetchPlan(selFloorId);
        const plan = { ...fetched, simPersons: fetched.simPersons ?? [] };
        setFloors((fs) => fs.map((f) => (f.id === selFloorId ? applyZoneDoorLinks({ ...f, ...plan }) : f)));
      } catch {
        // pas de plan => on garde le défaut
      }
    })();
  }, [selFloorId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [devices, badges] = await Promise.all([fetchMockDevices().catch(() => []), fetchMockUsers().catch(() => [])]);
        if (!active) return;
        setDeviceRegistry(devices);
        setBadgeCatalog(badges);
      } catch {
        if (active) {
          setDeviceRegistry([]);
          setBadgeCatalog([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useDebouncedEffect(() => {
    const f = floors.find((x) => x.id === selFloorId);
    if (f) savePlan(f).catch(() => {});
  }, [floors, selFloorId], 700);

  const [tool, setTool] = useState<Tool>("pan");
  const [grid, setGrid] = useState(10);
  const [thick, setThick] = useState(8);
  const [showPalettePanel, setShowPalettePanel] = useState(true);
  const [showZonesPanel, setShowZonesPanel] = useState(true);
  const [showSimulationPanel, setShowSimulationPanel] = useState(true);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);
  const [pendingZoneRenameId, setPendingZoneRenameId] = useState<string | null>(null);

  const { mqttUrl, setMqttUrl, connected, isConnecting, connect, disconnect, porteState, logs, publishBadgeCommand } = useMqttBridge(MQTT_WS_URL_DEFAULT);
  const dockerActive = useDockerStatus();

  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const selNode = floor.nodes.find((n) => n.id === selNodeId) || null;

  const [loadingMap, setLoadingMap] = useState<Record<string, "creating" | "deleting" | undefined>>({});
  const [simRunning, setSimRunning] = useState(false);

  const updateCurrentFloor = (mutator: (floor: Floor) => Floor) => {
    setFloors((fs) =>
      fs.map((f) => {
        if (f.id !== selFloorId) return f;
        const mutated = mutator(f);
        return applyZoneDoorLinks(mutated);
      })
    );
  };

  const addWall = (wall: Wall) => updateCurrentFloor((f) => ({ ...f, walls: [...f.walls, wall] }));
  const addNode = (node: DeviceNode) => updateCurrentFloor((f) => ({ ...f, nodes: [...f.nodes, node] }));
  const deleteWall = (wallId: string) => updateCurrentFloor((f) => ({ ...f, walls: f.walls.filter((w) => w.id !== wallId) }));

  const updateNode = (nodeId: string, updater: (node: DeviceNode) => DeviceNode) =>
    updateCurrentFloor((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? updater(n) : n)) }));

  const patchNode = (nodeId: string, patch: Partial<DeviceNode>) => updateNode(nodeId, (n) => ({ ...n, ...patch }));

  const deleteNodeById = (nodeId: string) => {
    updateCurrentFloor((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== nodeId) }));
  };

  const updateZone = (zoneId: string, patch: Partial<ZoneShape>) =>
    updateCurrentFloor((f) => ({
      ...f,
      zones: (f.zones ?? []).map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)),
    }));

  const deleteZone = (zoneId: string) =>
    updateCurrentFloor((f) => ({
      ...f,
      zones: (f.zones ?? []).filter((zone) => zone.id !== zoneId),
    }));

  const handleCreateNode = async (partial: Omit<DeviceNode, "deviceId">) => {
    try {
      const record = await createMockDevice(partial.kind);
      const node: DeviceNode = { ...partial, deviceId: record.id };
      addNode(node);
      setSelNodeId(node.id);
      setDeviceRegistry((prev) => [...prev.filter((d) => d.id !== record.id), record]);
    } catch (error) {
      alert("Impossible de générer un identifiant pour ce capteur (mock backend).");
    }
  };

  const flipSelectedHinge = () => {
    if (!selNode || selNode.kind !== "porte") return;
    updateNode(selNode.id, (n) => ({ ...n, hinge: (n.hinge === "left" ? "right" : "left") as Hinge }));
  };

  const rotateSelectedDoor = () => {
    if (!selNode || selNode.kind !== "porte") return;
    updateNode(selNode.id, (n) => ({ ...n, rot: (n.rot || 0) + Math.PI / 2 }));
  };

  const resetSelectedDoorAngle = () => {
    if (!selNode || selNode.kind !== "porte") return;
    updateNode(selNode.id, (n) => ({ ...n, rot: 0 }));
  };

  const badgeNodes = useMemo(() => floor.nodes.filter((n) => n.kind === "badgeuse" && n.deviceId), [floor]);
  const sendBadgeCommand = useCallback(
    (deviceId: string, badgeId: string, doorId?: string) => {
      const cleanId = (deviceId || "").trim();
      if (!cleanId) {
        console.warn("[MQTT] badge command skipped (deviceId vide)");
        return;
      }
      const cleanDoor = doorId?.trim();
      publishBadgeCommand(cleanId, { badgeId, doorId: cleanDoor || undefined })
        .catch((err) => console.error("[MQTT] badge command failed", err));
    },
    [publishBadgeCommand]
  );
  const canRunSimulation = simPersons.length > 0 && badgeNodes.length > 0;

  const handleAddPerson = (payload: Omit<SimPerson, "id">) => {
    updateCurrentFloor((f) => ({
      ...f,
      simPersons: [...(f.simPersons ?? []), { id: uid(), ...payload }],
    }));
  };

  const handleRemovePerson = (id: string) => {
    updateCurrentFloor((f) => ({
      ...f,
      simPersons: (f.simPersons ?? []).filter((p) => p.id !== id),
    }));
  };

  const toggleSimulation = () => {
    if (!simRunning && !canRunSimulation) return;
    if (!simRunning && !connected) {
      connect();
      alert("Connexion MQTT en cours... relance la simulation dans quelques secondes.");
      return;
    }
    setSimRunning((val) => !val);
  };

  useEffect(() => {
    if (!canRunSimulation && simRunning) setSimRunning(false);
  }, [canRunSimulation, simRunning]);

  useEffect(() => {
    if (!connected && simRunning) setSimRunning(false);
  }, [connected, simRunning]);

  useEffect(() => {
    if (!simRunning || !canRunSimulation || !connected) return;
    const lastBadgeMap: Record<string, number> = {};
    const interval = setInterval(() => {
      const now = Date.now();
      simPersons.forEach((person) => {
        const freq = Math.max(1, person.badgeFrequencySec ?? 5) * 1000;
        const last = lastBadgeMap[person.id] ?? 0;
        if (now - last >= freq) {
          const badgeuse = badgeNodes[Math.floor(Math.random() * badgeNodes.length)];
          if (badgeuse?.deviceId) {
            sendBadgeCommand(badgeuse.deviceId, person.badgeId, badgeuse.targetDoorId);
            lastBadgeMap[person.id] = now;
          }
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [simRunning, canRunSimulation, simPersons, badgeNodes, connected, sendBadgeCommand]);

  async function ensureService(node: DeviceNode) {
    if (!node.deviceId) {
      alert("Renseigne un deviceId");
      return;
    }
    setLoadingMap((m) => ({ ...m, [node.deviceId!]: "creating" }));
    try {
      const body: any = { kind: node.kind, device_id: node.deviceId };
      if (node.kind === "badgeuse" && node.targetDoorId) {
        body.door_id = node.targetDoorId;
      }
      const r = await fetch(`${ORCH_URL}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        alert(`Création ${node.kind} KO (${r.status})`);
        return;
      }
      await pollUntilReady(node.kind, node.deviceId);
    } finally {
      setLoadingMap((m) => {
        const copy = { ...m };
        if (node.deviceId) delete copy[node.deviceId];
        return copy;
      });
    }
  }

  async function handleDeleteNodeAndContainer(node: DeviceNode, removeImage = true) {
    if (node.deviceId && dockerActive[node.deviceId]) {
      setLoadingMap((m) => ({ ...m, [node.deviceId!]: "deleting" }));
      try {
        await deleteDeviceOnOrch(node.deviceId, removeImage);
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          try {
            const r = await fetch(`${ORCH_URL}/devices`);
            if (r.ok) {
              const arr: Array<{ id: string }> = await r.json();
              const still = arr.some((d) => d.id === node.deviceId);
              if (!still) break;
            }
          } catch {
            // retry silently
          }
          await new Promise((res) => setTimeout(res, 500));
        }
    } finally {
      setLoadingMap((m) => {
        const copy = { ...m };
        if (node.deviceId) delete copy[node.deviceId];
        return copy;
      });
    }
  }
  if (node.deviceId) {
    try {
      await deleteMockDevice(node.deviceId);
    } catch {
      // ignore mock delete errors
    } finally {
      setDeviceRegistry((prev) => prev.filter((d) => d.id !== node.deviceId));
    }
  }
  deleteNodeById(node.id);
  setSelNodeId(null);
}

  const handleBadge = (node: DeviceNode, badgeId?: string) => {
    if (!node.deviceId) return;
    if (!connected) {
      connect();
      alert("Connexion MQTT en cours... reessaie dans un instant.");
      return;
    }
    const fallback = badgeCatalog[0]?.badgeID || "BADGE-TEST";
    const badgeToSend = badgeId?.trim() || fallback;
    sendBadgeCommand(node.deviceId, badgeToSend, node.targetDoorId);
  };

  const handleDoorAction = (node: DeviceNode, action: "open" | "close" | "toggle") => {
    if (!node.deviceId) return;
    doorCmd(node.deviceId, action).catch(() => {});
  };

  const handleCreateZone = (points: ZonePoint[]) => {
    if (points.length < 3) return;
    const zoneId = uid();
    const defaultName = `Zone ${(floor.zones?.length ?? 0) + 1}`;
    updateCurrentFloor((f) => ({
      ...f,
      zones: [...(f.zones ?? []), { id: zoneId, points, name: defaultName }],
    }));
    setPendingZoneRenameId(zoneId);
    setShowZonesPanel(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selNode) {
        handleDeleteNodeAndContainer(selNode, true);
      }
      if ((e.key === "r" || e.key === "R") && selNode?.kind === "porte") {
        flipSelectedHinge();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selNode]);

  const showLeftPanel = showPalettePanel || showZonesPanel;
  const showRightPanel = showSimulationPanel || showPropertiesPanel || showLogs;
  const canvasColClass = (() => {
    if (showLeftPanel && showRightPanel) return "lg:col-span-8";
    if (showLeftPanel || showRightPanel) return "lg:col-span-10";
    return "lg:col-span-12";
  })();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopBar
        connected={connected}
        showConn={showConn}
        onToggleConn={() => setShowConn((s) => !s)}
        showLogs={showLogs}
        onToggleLogs={() => setShowLogs((s) => !s)}
        dark={dark}
        onDarkChange={setDark}
      />

      <div className="max-w-7xl mx-auto p-3 space-y-3">
        {showConn && (
          <MqttSettingsCard
            mqttUrl={mqttUrl}
            onMqttUrlChange={setMqttUrl}
            connected={connected}
            isConnecting={isConnecting}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <PanelToggle label="Palette" active={showPalettePanel} onClick={() => setShowPalettePanel((s) => !s)} />
        <PanelToggle label="Zones" active={showZonesPanel} onClick={() => setShowZonesPanel((s) => !s)} />
        <PanelToggle label="Simulation" active={showSimulationPanel} onClick={() => setShowSimulationPanel((s) => !s)} />
          <PanelToggle label="Propriétés" active={showPropertiesPanel} onClick={() => setShowPropertiesPanel((s) => !s)} />
          <PanelToggle label="Logs" active={showLogs} onClick={() => setShowLogs((s) => !s)} />
        </div>

        <div className="grid grid-cols-12 gap-3">
          {showLeftPanel && (
            <div className="col-span-12 lg:col-span-2 space-y-3">
              {showPalettePanel && (
                <PalettePanel
                  tool={tool}
                  onToolChange={setTool}
                  grid={grid}
                  onGridChange={setGrid}
                  thick={thick}
                  onThickChange={setThick}
                  selNode={selNode}
                  onFlipHinge={flipSelectedHinge}
                  onRotateDoor={rotateSelectedDoor}
                  onResetAngle={resetSelectedDoorAngle}
                />
              )}
              {showZonesPanel && (
                <ZonesPanel
                  zones={zones}
                  showBorders={showZoneWalls}
                  showFill={showZoneFill}
                  onToggleBorders={() => setShowZoneWalls((v) => !v)}
                  onToggleFill={() => setShowZoneFill((v) => !v)}
                  onRename={(zoneId, name) => updateZone(zoneId, { name })}
                  onDelete={(zoneId) => deleteZone(zoneId)}
                  autoFocusZoneId={pendingZoneRenameId}
                  onAutoFocusConsumed={() => setPendingZoneRenameId(null)}
                />
              )}
            </div>
          )}

          <div className={`col-span-12 ${canvasColClass}`}>
          <CanvasBoard
            floor={floor}
            tool={tool}
            grid={grid}
            thick={thick}
            selNodeId={selNodeId}
            onSelectNode={setSelNodeId}
            onAddWall={addWall}
            onCreateNode={handleCreateNode}
            onUpdateNode={updateNode}
            onDeleteWall={deleteWall}
            zones={zones}
            showZoneWalls={showZoneWalls}
            showZoneFill={showZoneFill}
            onCreateZone={handleCreateZone}
            loadingMap={loadingMap}
            dockerActive={dockerActive}
              porteState={porteState}
              isDarkMode={dark}
            />
          </div>

          {showRightPanel && (
            <div className="col-span-12 lg:col-span-2 space-y-3">
              {showSimulationPanel && (
                <SimulationPanel
                  persons={simPersons}
                  onAddPerson={handleAddPerson}
                  onRemovePerson={handleRemovePerson}
                  onUpdatePerson={(id, patch) =>
                    updateCurrentFloor((f) => ({
                      ...f,
                      simPersons: (f.simPersons ?? []).map((person) => (person.id === id ? { ...person, ...patch } : person)),
                    }))
                  }
                  running={simRunning}
                  canRun={canRunSimulation}
                  onToggleSimulation={toggleSimulation}
                  badgeCatalog={badgeCatalog}
                />
              )}
              {showPropertiesPanel && (
                <PropertiesPanel
                  selNode={selNode}
                  floor={floor}
                  loadingMap={loadingMap}
                  onUpdateNode={patchNode}
                  onEnsureService={ensureService}
                  onDeleteNode={handleDeleteNodeAndContainer}
                  onBadge={handleBadge}
                  onDoorAction={handleDoorAction}
                  doorCatalog={doorCatalog}
                  badgeCatalog={badgeCatalog}
                />
              )}
              {showLogs && <LogsPanel logs={logs} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
          : "border-slate-200 text-slate-500 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
      }`}
    >
      {active ? "Masquer" : "Afficher"} {label}
    </button>
  );
}

const DOOR_TOUCH_THRESHOLD = 18;

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

function computeDoorIdsForZone(zone: ZoneShape, doorNodes: DeviceNode[]) {
  if (!zone.points?.length || !doorNodes.length) return [];
  const identifiers: string[] = [];
  const seen = new Set<string>();
  for (const door of doorNodes) {
    const doorId = door.deviceId || door.id;
    if (!doorId) continue;
    const inside = pointInPolygon({ x: door.x, y: door.y }, zone.points);
    const distance = inside ? 0 : distancePointToPolygon(door.x, door.y, zone.points);
    if (inside || distance <= DOOR_TOUCH_THRESHOLD) {
      if (!seen.has(doorId)) {
        seen.add(doorId);
        identifiers.push(doorId);
      }
    }
  }
  return identifiers;
}

function applyZoneDoorLinks(floor: Floor): Floor {
  if (!floor.zones?.length) return floor;
  const doorNodes = floor.nodes.filter((n) => n.kind === "porte");
  let changed = false;
  const enriched = floor.zones.map((zone) => {
    const doorIds = computeDoorIdsForZone(zone, doorNodes);
    const previous = zone.doorIds ?? [];
    if (!arraysEqual(previous, doorIds)) {
      changed = true;
      return { ...zone, doorIds };
    }
    return zone;
  });
  return changed ? { ...floor, zones: enriched } : floor;
}


