import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { badge, doorCmd, fetchPlan, savePlan } from "@/api/orchestrator";
import {
  createDirectoryDevice,
  deleteDirectoryDevice,
  fetchDirectoryDevices,
  fetchDirectoryUsers,
  fetchDoorIds,
  updateDirectoryDevice,
  type DirectoryUser,
} from "@/api/directory";
import { MQTT_WS_URL_DEFAULT } from "@/config";
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect";
import { useMqttBridge } from "@/hooks/useMqttBridge";
import { distancePointToPolygon, pointInPolygon, uid } from "@/utils/geometry";
import type { DeviceNode, Floor, Hinge, ZoneShape } from "@/types/floor";
import { CanvasBoard } from "./components/CanvasBoard";
import { LogsPanel } from "./components/LogsPanel";
import { MqttSettingsCard } from "./components/MqttSettingsCard";
import { PalettePanel } from "./components/PalettePanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SimulationPanel } from "./components/SimulationPanel";
import { TopBar } from "./components/TopBar";
import { ZonesPanel } from "./components/ZonesPanel";
import type { Tool } from "./types";

type LoadingStatus = Record<string, "creating" | "deleting" | undefined>;

const ZONE_TOUCH_THRESHOLD = 12;

const annotateFloorWithZones = (floor: Floor): Floor => {
  const zones = floor.zones ?? [];
  const doors = floor.nodes.filter((n) => n.kind === "porte");

  const doorLocations: Record<string, string[]> = {};
  const zonesWithDoors = zones.map((zone) => {
    const hits: string[] = [];
    if (zone.points.length >= 2) {
      for (const door of doors) {
        const inside = pointInPolygon({ x: door.x, y: door.y }, zone.points);
        const nearEdge = distancePointToPolygon(door.x, door.y, zone.points) <= ZONE_TOUCH_THRESHOLD;
        if (inside || nearEdge) {
          hits.push(door.deviceId || door.id);
          const zoneName = zone.name?.trim();
          if (zoneName) doorLocations[door.id] = [...(doorLocations[door.id] ?? []), zoneName];
        }
      }
    }
    return { ...zone, doorIds: hits };
  });

  const nodesWithLocation = floor.nodes.map((n) => {
    if (n.kind !== "porte") return n;
    const labels = doorLocations[n.id] ?? [];
    return { ...n, location: labels.length ? labels.join(" et ") : undefined };
  });

  return { ...floor, zones: zonesWithDoors, nodes: nodesWithLocation };
};

export default function WorkspacePage() {
  const [showConn, setShowConn] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showPalettePanel, setShowPalettePanel] = useState(true);
  const [showSimulationPanel, setShowSimulationPanel] = useState(true);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);
  const [showZonesPanel, setShowZonesPanel] = useState(true);
  const [dark, setDark] = useState(false);
  const [nextZoneName, setNextZoneName] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const [floors, setFloors] = useState<Floor[]>(() => [
    annotateFloorWithZones({
      id: "etage-1",
      name: "Étage 1",
      width: 1400,
      height: 900,
      walls: [
        { id: uid(), x1: 80, y1: 80, x2: 1320, y2: 80, thick: 8 },
        { id: uid(), x1: 1320, y1: 80, x2: 1320, y2: 820, thick: 8 },
        { id: uid(), x1: 1320, y1: 820, x2: 80, y2: 820, thick: 8 },
        { id: uid(), x1: 80, y1: 820, x2: 80, y2: 80, thick: 8 },
      ],
      nodes: [],
      simPersons: [],
      zones: [],
    }),
  ]);
  const [selFloorId] = useState("etage-1");
  const floor = useMemo(() => floors.find((f) => f.id === selFloorId)!, [floors, selFloorId]);

  // Chargement / sauvegarde plan -------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const fetched = await fetchPlan(selFloorId);
        setFloors((fs) =>
          fs.map((f) =>
            f.id === selFloorId
              ? annotateFloorWithZones({
                  ...f,
                  ...fetched,
                  simPersons: fetched.simPersons ?? [],
                  zones: fetched.zones ?? [],
                })
              : f
          )
        );
      } catch {
        // pas de plan -> on garde le défaut
      }
    })();
  }, [selFloorId]);

  useDebouncedEffect(
    () => {
      const f = floors.find((x) => x.id === selFloorId);
      if (f) savePlan(f).catch(() => {});
    },
    [floors, selFloorId],
    700
  );

  // UI state --------------------------------------------------------------------
  const [tool, setTool] = useState<Tool>("pan");
  const [grid, setGrid] = useState(10);
  const [thick, setThick] = useState(8);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const selNode = floor.nodes.find((n) => n.id === selNodeId) || null;
  const [showZoneWalls, setShowZoneWalls] = useState(true);
  const [showZoneFill, setShowZoneFill] = useState(true);
  const deviceIdsSignature = useMemo(
    () => floor.nodes.map((n) => n.deviceId || "").filter(Boolean).sort().join("|"),
    [floor.nodes]
  );

  // Data annuaire ---------------------------------------------------------------
  const [doorCatalog, setDoorCatalog] = useState<string[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<DirectoryUser[]>([]);
  useEffect(() => {
    fetchDoorIds().then(setDoorCatalog).catch(() => setDoorCatalog([]));
    fetchDirectoryUsers().then(setBadgeCatalog).catch(() => setBadgeCatalog([]));
  }, []);

  // MQTT ------------------------------------------------------------------------
  const { mqttUrl, setMqttUrl, connected, isConnecting, connect, disconnect, porteState, logs, publishBadgeCommand } = useMqttBridge(MQTT_WS_URL_DEFAULT);
  const [loadingMap, setLoadingMap] = useState<LoadingStatus>({});
  const [deviceReady, setDeviceReady] = useState<Record<string, boolean>>({});
  const dockerStatus = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(deviceReady).map(([id, ready]) => [
          id,
          {
            ready,
            status: ready ? "ready" : "creating",
          },
        ])
      ),
    [deviceReady]
  );

  // Helpers plan ----------------------------------------------------------------
  const updateCurrentFloor = (mutator: (floor: Floor) => Floor) => {
    setFloors((fs) => fs.map((f) => (f.id === floor.id ? annotateFloorWithZones(mutator(f)) : f)));
  };

  const addWall = (wall: any) => updateCurrentFloor((f) => ({ ...f, walls: [...f.walls, wall] }));
  const addNode = (node: DeviceNode) => updateCurrentFloor((f) => ({ ...f, nodes: [...f.nodes, node] }));
  const deleteWall = (wallId: string) => updateCurrentFloor((f) => ({ ...f, walls: f.walls.filter((w) => w.id !== wallId) }));

  const updateNode = (nodeId: string, updater: (node: DeviceNode) => DeviceNode) =>
    updateCurrentFloor((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? updater(n) : n)) }));

  const patchNode = (nodeId: string, patch: Partial<DeviceNode>) => updateNode(nodeId, (n) => ({ ...n, ...patch }));

  const deleteNodeById = (nodeId: string) => updateCurrentFloor((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== nodeId) }));

  const addZone = (points: ZoneShape["points"], name?: string) => {
    const zones = floor.zones ?? [];
    const label = name?.trim() || nextZoneName.trim() || `Zone ${zones.length + 1}`;
    const z: ZoneShape = { id: `zone-${uid()}`, points, name: label };
    updateCurrentFloor((f) => ({ ...f, zones: [...(f.zones ?? []), z] }));
    setNextZoneName("");
    return z.id;
  };

  const renameZone = (zoneId: string, name: string) => {
    updateCurrentFloor((f) => ({
      ...f,
      zones: (f.zones ?? []).map((z) => (z.id === zoneId ? { ...z, name } : z)),
    }));
  };

  const deleteZone = (zoneId: string) => {
    updateCurrentFloor((f) => ({ ...f, zones: (f.zones ?? []).filter((z) => z.id !== zoneId) }));
  };

  const persistZonesToBackend = async () => {
    const doors = floor.nodes.filter((n) => n.kind === "porte");
    if (!doors.length) return;
    try {
      await Promise.all(
        doors.map((door) => {
          const zoneLabel = door.location?.trim() || null;
          const targetId = door.deviceId || door.id;
          return updateDirectoryDevice(targetId, { zone: zoneLabel, location: zoneLabel }).catch(() => {});
        })
      );
    } catch {
      // erreurs silencieuses pour ne pas bloquer l'UI
    }
  };

  // Simulation ------------------------------------------------------------------
  const [simRunning, setSimRunning] = useState(false);
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const badgeNodes = useMemo(() => floor.nodes.filter((n) => n.kind === "badgeuse" && n.deviceId), [floor]);
  const canRunSimulation = (floor.simPersons?.length ?? 0) > 0 && badgeNodes.length > 0;

  useEffect(() => {
    if (!simRunning || !canRunSimulation) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }
    const lastBadgeMap: Record<string, number> = {};
    simIntervalRef.current = setInterval(() => {
      const now = Date.now();
      (floor.simPersons ?? []).forEach((person) => {
        const freq = Math.max(1, person.badgeFrequencySec ?? 5) * 1000;
        const last = lastBadgeMap[person.id] ?? 0;
        if (now - last >= freq) {
          const badgeuse = badgeNodes[Math.floor(Math.random() * badgeNodes.length)];
          if (badgeuse?.deviceId) {
            publishBadgeCommand(badgeuse.deviceId, { badgeId: person.badgeId, doorId: badgeuse.targetDoorId }).catch(() => {});
            lastBadgeMap[person.id] = now;
          }
        }
      });
    }, 1000);
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [simRunning, canRunSimulation, floor.simPersons, badgeNodes, publishBadgeCommand]);

  useEffect(() => {
    if (!canRunSimulation && simRunning) setSimRunning(false);
  }, [canRunSimulation, simRunning]);

  // Actions devices -------------------------------------------------------------
  const ensureService = useCallback(async (node: DeviceNode) => {
    const provisionalKey = node.deviceId ?? node.id;
    setLoadingMap((m) => ({ ...m, [provisionalKey]: "creating" }));
    setDeviceReady((s) => ({ ...s, [provisionalKey]: false }));
    let assignedId = node.deviceId;
    try {
      const created = await createDirectoryDevice(node.kind, {
        preferredId: node.deviceId,
        targetDoorId: node.targetDoorId,
      });
      assignedId = created.id;
      patchNode(node.id, { deviceId: assignedId });
      setLoadingMap((m) => ({ ...m, [assignedId!]: "creating" }));
      setDeviceReady((s) => ({ ...s, [assignedId!]: false }));
      // côté backend/iotsimulator la création est immédiate côté API
      setDeviceReady((s) => ({ ...s, [assignedId!]: true }));
    } finally {
      setLoadingMap((m) => {
        const copy = { ...m };
        if (assignedId) delete copy[assignedId];
        if (!assignedId && node.deviceId) delete copy[node.deviceId];
        return copy;
      });
      if (assignedId) {
        setDeviceReady((s) => ({ ...s, [assignedId!]: s[assignedId!] ?? false }));
      }
    }
  }, []);

  // Au chargement, on re-synchronise les devices connus avec l'annuaire et on relance ceux qui manquent.
  useEffect(() => {
    const ids = floor.nodes.map((n) => n.deviceId).filter(Boolean) as string[];
    if (!ids.length) return;
    // Montrer au moins un anneau rouge en attendant l'info réelle
    setDeviceReady((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (next[id] === undefined) next[id] = false;
      });
      return next;
    });
    let cancelled = false;
    (async () => {
      try {
        const devices = await fetchDirectoryDevices();
        if (cancelled) return;
        const existing = new Set(devices.map((d) => d.id));
        const readyUpdates: Record<string, boolean> = {};
        ids.forEach((id) => {
          if (existing.has(id)) readyUpdates[id] = true;
        });
        if (Object.keys(readyUpdates).length) {
          setDeviceReady((prev) => ({ ...prev, ...readyUpdates }));
        }
        const missingNodes = floor.nodes.filter((n) => n.deviceId && !existing.has(n.deviceId));
        for (const node of missingNodes) {
          if (cancelled) break;
          await ensureService({ ...node, deviceId: node.deviceId });
        }
      } catch {
        // pas grave, on réessaiera au prochain rafraîchissement
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceIdsSignature, selFloorId, ensureService]);

  const handleDeleteNodeAndContainer = async (node: DeviceNode, removeImage = true) => {
    if (node.deviceId) {
      setLoadingMap((m) => ({ ...m, [node.deviceId!]: "deleting" }));
      try {
        await deleteDirectoryDevice(node.deviceId);
      } finally {
        setLoadingMap((m) => {
          const copy = { ...m };
          if (node.deviceId) delete copy[node.deviceId];
          return copy;
        });
        setDeviceReady((s) => {
          const copy = { ...s };
          delete copy[node.deviceId!];
          return copy;
        });
      }
    }
    deleteNodeById(node.id);
    setSelNodeId(null);
  };

  const handleBadge = (node: DeviceNode, badgeId: string) => {
    if (!node.deviceId) return;
    publishBadgeCommand(node.deviceId, { badgeId, doorId: node.targetDoorId }).catch(() => {
      badge(node.deviceId!, badgeId).catch(() => {});
    });
  };

  const handleLinkDoor = async (node: DeviceNode, doorId: string) => {
    // on sauvegarde l'association sur le node
    patchNode(node.id, { targetDoorId: doorId });
    const preferredId = node.deviceId;
    if (preferredId) {
      // recrée le device avec la même id mais avec la nouvelle porte
      setLoadingMap((m) => ({ ...m, [preferredId]: "creating" }));
      try {
        await deleteDirectoryDevice(preferredId);
      } catch {
        // on tente quand même de recréer
      }
      await ensureService({ ...node, deviceId: preferredId, targetDoorId: doorId });
    }
  };

  const handleDoorAction = (node: DeviceNode, action: "open" | "close" | "toggle") => {
    if (!node.deviceId) return;
    doorCmd(node.deviceId, action).catch(() => {});
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

  // Création initiale de node depuis CanvasBoard
  const handleCreateNode = (node: Omit<DeviceNode, "deviceId">) => {
    const fullNode: DeviceNode = { ...node, deviceId: undefined };
    addNode(fullNode);
    setSelNodeId(node.id);
    // Création auto côté backend/iotsimulator
    ensureService(fullNode).catch(() => {});
  };

  const showRightPanel = showSimulationPanel || showPropertiesPanel || showLogs || showZonesPanel;
  const canvasColClass = showRightPanel ? (showPalettePanel ? "lg:col-span-8" : "lg:col-span-10") : showPalettePanel ? "lg:col-span-10" : "lg:col-span-12";

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
          <PanelToggle label="Simulation" active={showSimulationPanel} onClick={() => setShowSimulationPanel((s) => !s)} />
          <PanelToggle label="Propriétés" active={showPropertiesPanel} onClick={() => setShowPropertiesPanel((s) => !s)} />
          <PanelToggle label="Zones" active={showZonesPanel} onClick={() => setShowZonesPanel((s) => !s)} />
          <PanelToggle label="Logs" active={showLogs} onClick={() => setShowLogs((s) => !s)} />
        </div>

        <div className="grid grid-cols-12 gap-3">
          {showPalettePanel && (
            <div className="col-span-12 lg:col-span-2">
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
              zones={floor.zones ?? []}
              showZoneWalls={showZoneWalls}
              showZoneFill={showZoneFill}
              onCreateZone={(points) => addZone(points)}
              loadingMap={loadingMap}
              dockerActive={dockerStatus}
              porteState={porteState}
              isDarkMode={dark}
            />
          </div>

          {showRightPanel && (
            <div className="col-span-12 lg:col-span-2 space-y-3">
              {showSimulationPanel && (
                <SimulationPanel
                  persons={floor.simPersons ?? []}
                  onAddPerson={(payload) =>
                    updateCurrentFloor((f) => ({
                      ...f,
                      simPersons: [...(f.simPersons ?? []), { id: uid(), ...payload }],
                    }))
                  }
                  onRemovePerson={(id) =>
                    updateCurrentFloor((f) => ({ ...f, simPersons: (f.simPersons ?? []).filter((p) => p.id === id) }))
                  }
                  onUpdatePerson={(id, patch) =>
                    updateCurrentFloor((f) => ({
                      ...f,
                      simPersons: (f.simPersons ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
                    }))
                  }
                  running={simRunning}
                  canRun={canRunSimulation}
                  onToggleSimulation={() => setSimRunning((s) => !s)}
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
                  onLinkDoor={handleLinkDoor}
                  onBadge={handleBadge}
                  onDoorAction={handleDoorAction}
                  doorCatalog={doorCatalog}
                  badgeCatalog={badgeCatalog}
                />
              )}

              {showZonesPanel && (
                <ZonesPanel
                  zones={floor.zones ?? []}
                  showBorders={showZoneWalls}
                  showFill={showZoneFill}
                  onToggleBorders={() => setShowZoneWalls((v) => !v)}
                  onToggleFill={() => setShowZoneFill((v) => !v)}
                  onCreateEmptyZone={(name) => setNextZoneName(name)}
                  onRename={renameZone}
                  onDelete={deleteZone}
                  onPersistZones={persistZonesToBackend}
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
