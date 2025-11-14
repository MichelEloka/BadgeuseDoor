import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteDeviceOnOrch, doorCmd, fetchPlan, pollUntilReady, savePlan } from "@/api/orchestrator";
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
import type { Box, DeviceNode, Floor, Hinge, Wall, SimPerson } from "@/types/floor";
import { uid } from "@/utils/geometry";
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
      boxes: [],
      nodes: [],
      simPersons: [],
    },
  ]);
  const [selFloorId] = useState("etage-1");
  const floor = useMemo(() => floors.find((f) => f.id === selFloorId)!, [floors, selFloorId]);
  const simPersons = floor.simPersons ?? [];

  useEffect(() => {
    (async () => {
      try {
        const fetched = await fetchPlan(selFloorId);
        const plan = { ...fetched, simPersons: fetched.simPersons ?? [] };
        setFloors((fs) => fs.map((f) => (f.id === selFloorId ? { ...f, ...plan } : f)));
      } catch {
        // pas de plan => on garde le défaut
      }
    })();
  }, [selFloorId]);

  useDebouncedEffect(() => {
    const f = floors.find((x) => x.id === selFloorId);
    if (f) savePlan(f).catch(() => {});
  }, [floors, selFloorId], 700);

  const [tool, setTool] = useState<Tool>("pan");
  const [grid, setGrid] = useState(10);
  const [thick, setThick] = useState(8);
  const [showPalettePanel, setShowPalettePanel] = useState(true);
  const [showSimulationPanel, setShowSimulationPanel] = useState(true);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);

  const { mqttUrl, setMqttUrl, connected, isConnecting, connect, disconnect, porteState, logs, publishBadgeCommand } = useMqttBridge(MQTT_WS_URL_DEFAULT);
  const dockerActive = useDockerStatus();

  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const selNode = floor.nodes.find((n) => n.id === selNodeId) || null;

  const [loadingMap, setLoadingMap] = useState<Record<string, "creating" | "deleting" | undefined>>({});
  const [simRunning, setSimRunning] = useState(false);

  const updateCurrentFloor = (mutator: (floor: Floor) => Floor) => {
    setFloors((fs) => fs.map((f) => (f.id === floor.id ? mutator(f) : f)));
  };

  const addWall = (wall: Wall) => updateCurrentFloor((f) => ({ ...f, walls: [...f.walls, wall] }));
  const addBox = (box: Box) => updateCurrentFloor((f) => ({ ...f, boxes: [...f.boxes, box] }));
  const deleteBox = (boxId: string) => updateCurrentFloor((f) => ({ ...f, boxes: f.boxes.filter((b) => b.id !== boxId) }));
  const addNode = (node: DeviceNode) => updateCurrentFloor((f) => ({ ...f, nodes: [...f.nodes, node] }));
  const deleteWall = (wallId: string) => updateCurrentFloor((f) => ({ ...f, walls: f.walls.filter((w) => w.id !== wallId) }));

  const updateNode = (nodeId: string, updater: (node: DeviceNode) => DeviceNode) =>
    updateCurrentFloor((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? updater(n) : n)) }));

  const patchNode = (nodeId: string, patch: Partial<DeviceNode>) => updateNode(nodeId, (n) => ({ ...n, ...patch }));

  const deleteNodeById = (nodeId: string) => {
    updateCurrentFloor((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== nodeId) }));
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
    deleteNodeById(node.id);
    setSelNodeId(null);
  }

  const handleBadge = (node: DeviceNode) => {
    if (!node.deviceId) return;
    if (!connected) {
      connect();
      alert("Connexion MQTT en cours... reessaie dans un instant.");
      return;
    }
    sendBadgeCommand(node.deviceId, "BADGE-TEST", node.targetDoorId);
  };

  const handleDoorAction = (node: DeviceNode, action: "open" | "close" | "toggle") => {
    if (!node.deviceId) return;
    doorCmd(node.deviceId, action).catch(() => {});
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

  const showRightPanel = showSimulationPanel || showPropertiesPanel || showLogs;
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
              onAddBox={addBox}
              onAddNode={addNode}
              onUpdateNode={updateNode}
              onDeleteWall={deleteWall}
              onDeleteBox={deleteBox}
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


