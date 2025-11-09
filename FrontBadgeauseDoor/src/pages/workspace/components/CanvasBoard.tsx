import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, WheelEvent } from "react";

import { DoorGlyph } from "@/components/DoorGlyph";
import { Spinner } from "@/components/Spinner";
import { BADGEUSE_LINK_RADIUS } from "@/config";
import type { Box, DeviceNode, Floor, Hinge, Wall } from "@/types/floor";
import { clamp, dist, nearestWallSnap, snap, uid } from "@/utils/geometry";
import type { Tool } from "../types";

interface CanvasBoardProps {
  floor: Floor;
  tool: Tool;
  grid: number;
  thick: number;
  selNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onAddWall: (wall: Wall) => void;
  onAddBox: (box: Box) => void;
  onAddNode: (node: DeviceNode) => void;
  onUpdateNode: (nodeId: string, updater: (node: DeviceNode) => DeviceNode) => void;
  onDeleteWall: (wallId: string) => void;
  onDeleteBox: (boxId: string) => void;
  loadingMap: Record<string, "creating" | "deleting" | undefined>;
  dockerActive: Record<string, { ready: boolean; status: string }>;
  porteState: Record<string, boolean>;
  isDarkMode: boolean;
}

export function CanvasBoard({
  floor,
  tool,
  grid,
  thick,
  selNodeId,
  onSelectNode,
  onAddWall,
  onAddBox,
  onAddNode,
  onUpdateNode,
  onDeleteWall,
  onDeleteBox,
  loadingMap,
  dockerActive,
  porteState,
  isDarkMode,
}: CanvasBoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const panRef = useRef({ drag: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [drawLineStart, setDrawLineStart] = useState<{ x1: number; y1: number } | null>(null);
  const [drawRectStart, setDrawRectStart] = useState<{ x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const clientToWorld = (evt: MouseEvent<Element>) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = (evt as any).clientX;
    pt.y = (evt as any).clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const gpt = pt.matrixTransform(inv);
    return { x: (gpt.x - view.x) / view.z, y: (gpt.y - view.y) / view.z };
  };

  const doorIsOpen = (deviceId?: string) => (deviceId ? !!porteState[deviceId] : false);

  const colors = useMemo(
    () => ({
      wallStroke: isDarkMode ? "#e2e8f0" : "#0f172a",
      boxFill: isDarkMode ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.08)",
      gridLines: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
      labelPrimary: isDarkMode ? "#e2e8f0" : "#334155",
      labelSecondary: isDarkMode ? "#94a3b8" : "#64748b",
      selection: "#38bdf8",
    }),
    [isDarkMode]
  );

  const findNearestDoorDeviceId = (x: number, y: number) => {
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
  };

  const placeNode = (kind: "porte" | "badgeuse") => (e: MouseEvent<Element>) => {
    const w = clientToWorld(e);
    let x = snap(w.x, grid);
    let y = snap(w.y, grid);
    let rot = 0;
    let hinge: Hinge = "left";
    let targetDoorId: string | undefined;
    if (kind === "porte") {
      const snapInfo = nearestWallSnap(floor.walls, x, y);
      if (snapInfo) {
        x = snap(snapInfo.x, grid);
        y = snap(snapInfo.y, grid);
        rot = snapInfo.angle;
      }
    } else if (kind === "badgeuse") {
      targetDoorId = findNearestDoorDeviceId(x, y);
    }
    const nn: DeviceNode = { id: uid(), kind, x, y, rot, hinge, targetDoorId };
    onAddNode(nn);
    onSelectNode(nn.id);
  };

  const handleWallClick = (wall: Wall, e: MouseEvent<Element>) => {
    e.stopPropagation();
    if (e.detail === 2) {
      onDeleteWall(wall.id);
      setSelectedWallId(null);
      setSelectedBoxId(null);
    } else {
      setSelectedWallId(wall.id);
      setSelectedBoxId(null);
    }
  };

  const handleBoxClick = (box: Box, e: MouseEvent<Element>) => {
    e.stopPropagation();
    if (e.detail === 2) {
      onDeleteBox(box.id);
      setSelectedBoxId(null);
      setSelectedWallId(null);
    } else {
      setSelectedBoxId(box.id);
      setSelectedWallId(null);
    }
  };

  const onWheelCapture = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 0.9 : 1.1;
    const m = clientToWorld(e as any);
    setView((v) => ({ z: clamp(v.z * f, 0.3, 3), x: m.x - (m.x - v.x) * f, y: m.y - (m.y - v.y) * f }));
  };

  const handlePanStart = (e: MouseEvent<Element>) => {
    panRef.current = { drag: true, sx: (e as any).clientX, sy: (e as any).clientY, ox: view.x, oy: view.y };
  };

  const handlePanMove = (e: MouseEvent<Element>) => {
    if (!panRef.current.drag) return;
    const dx = ((e as any).clientX - panRef.current.sx) / view.z;
    const dy = ((e as any).clientY - panRef.current.sy) / view.z;
    setView((v) => ({ ...v, x: panRef.current.ox + dx, y: panRef.current.oy + dy }));
  };

  const onMouseDown = (e: MouseEvent<Element>) => {
    const w = clientToWorld(e);
    if (tool === "pan") {
      handlePanStart(e);
    } else if (tool === "wall-line") {
      setDrawLineStart({ x1: snap(w.x, grid), y1: snap(w.y, grid) });
    } else if (tool === "wall-rect") {
      setDrawRectStart({ x: snap(w.x, grid), y: snap(w.y, grid) });
    }
  };

  const onMouseMove = (e: MouseEvent<Element>) => {
    const w = clientToWorld(e);
    setHover({ x: snap(w.x, grid), y: snap(w.y, grid) });
    if (panRef.current.drag) {
      handlePanMove(e);
    }
    if (!dragId) return;
    onUpdateNode(dragId, (node) => {
      let x = snap(w.x, grid);
      let y = snap(w.y, grid);
      let rot = node.rot || 0;
      let targetDoorId = node.targetDoorId;
      if (node.kind === "porte") {
        const snapInfo = nearestWallSnap(floor.walls, x, y);
        if (snapInfo) {
          x = snap(snapInfo.x, grid);
          y = snap(snapInfo.y, grid);
          rot = snapInfo.angle;
        }
      } else if (node.kind === "badgeuse") {
        const nearest = findNearestDoorDeviceId(x, y);
        targetDoorId = nearest ?? node.targetDoorId;
      }
      return { ...node, x, y, rot, targetDoorId };
    });
  };

  const onMouseUp = (e: MouseEvent<Element>) => {
    const w = clientToWorld(e);
    if (tool === "pan") {
      panRef.current.drag = false;
      return;
    }
    if (tool === "wall-line" && drawLineStart) {
      const x1 = drawLineStart.x1;
      const y1 = drawLineStart.y1;
      const x2 = snap(w.x, grid);
      const y2 = snap(w.y, grid);
      if (Math.hypot(x2 - x1, y2 - y1) > 5) {
        onAddWall({ id: uid(), x1, y1, x2, y2, thick });
      }
      setDrawLineStart(null);
      return;
    }
    if (tool === "wall-rect" && drawRectStart) {
      const x0 = drawRectStart.x;
      const y0 = drawRectStart.y;
      const x1 = snap(w.x, grid);
      const y1 = snap(w.y, grid);
      const x = Math.min(x0, x1);
      const y = Math.min(y0, y1);
      const wdt = Math.abs(x1 - x0);
      const hgt = Math.abs(y1 - y0);
      if (wdt > 4 && hgt > 4) {
        onAddBox({ id: uid(), x, y, w: wdt, h: hgt, thick });
      }
      setDrawRectStart(null);
    }
  };

  const onNodeDown = (id: string) => (e: MouseEvent<Element>) => {
    e.stopPropagation();
    onSelectNode(id);
    setDragId(id);
    setSelectedWallId(null);
    setSelectedBoxId(null);
  };

  const onNodeUp = () => setDragId(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawLineStart(null);
        setDrawRectStart(null);
        panRef.current.drag = false;
        setDragId(null);
        setSelectedWallId(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedWallId) {
          onDeleteWall(selectedWallId);
          setSelectedWallId(null);
        } else if (selectedBoxId) {
          onDeleteBox(selectedBoxId);
          setSelectedBoxId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedWallId, selectedBoxId, onDeleteWall, onDeleteBox]);

  return (
    <div className="rounded-xl border shadow bg-white dark:bg-slate-900 overflow-hidden select-none">
      <svg
        ref={svgRef}
        onWheelCapture={onWheelCapture}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={(e) => {
          onMouseUp(e);
          onNodeUp();
        }}
        onClick={(e) => {
          setSelectedWallId(null);
          setSelectedBoxId(null);
          if (tool === "place-porte") placeNode("porte")(e);
          if (tool === "place-badgeuse") placeNode("badgeuse")(e);
        }}
        width="100%"
        height="720"
        viewBox={`0 0 ${floor.width} ${floor.height}`}
        style={{
          backgroundSize: `${grid}px ${grid}px`,
          backgroundImage: `linear-gradient(to right, ${colors.gridLines} 1px, transparent 1px), linear-gradient(to bottom, ${colors.gridLines} 1px, transparent 1px)`,
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
          {floor.boxes.map((b) => {
            const isSelected = selectedBoxId === b.id;
            return (
              <rect
                key={b.id}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={colors.boxFill}
                stroke={isSelected ? colors.selection : colors.wallStroke}
                strokeWidth={(b.thick || thick) + (isSelected ? 2 : 0)}
                rx={2}
                onClick={(e) => handleBoxClick(b, e)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {floor.walls.map((w) => {
            const isSelected = selectedWallId === w.id;
            return (
              <line
                key={w.id}
                x1={w.x1}
                y1={w.y1}
                x2={w.x2}
                y2={w.y2}
                stroke={isSelected ? colors.selection : colors.wallStroke}
                strokeWidth={(w.thick || thick) + (isSelected ? 2 : 0)}
                strokeLinecap="round"
                onClick={(e) => handleWallClick(w, e)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {floor.nodes
            .filter((n) => n.kind === "badgeuse" && n.targetDoorId)
            .map((badgeuse) => {
              const door = floor.nodes.find((d) => d.kind === "porte" && d.deviceId === badgeuse.targetDoorId);
              if (!door) return null;
              return (
                <line
                  key={`link-${badgeuse.id}-${door.id}`}
                  x1={badgeuse.x}
                  y1={badgeuse.y}
                  x2={door.x}
                  y2={door.y}
                  stroke="#38bdf8"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  opacity={0.7}
                />
              );
            })}

          {drawLineStart && hover && (
            <line x1={drawLineStart.x1} y1={drawLineStart.y1} x2={hover.x} y2={hover.y} stroke="#38bdf8" strokeDasharray="6 6" strokeWidth={thick} />
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

          {floor.nodes.map((n) => {
            const isLoading = !!(n.deviceId && loadingMap[n.deviceId]);
            const dockerOk = n.deviceId ? dockerActive[n.deviceId]?.ready : false;
            const loadingKind = n.deviceId ? loadingMap[n.deviceId] : undefined;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                onMouseDown={onNodeDown(n.id)}
                style={{ cursor: "grab" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(n.id);
                  setSelectedWallId(null);
                  setSelectedBoxId(null);
                }}
              >
                {n.kind === "porte" ? (
                  <DoorGlyph
                    angle={n.rot || 0}
                    open={doorIsOpen(n.deviceId)}
                    hinge={n.hinge || "left"}
                    label={n.deviceId || "porte"}
                    labelColor={colors.labelPrimary}
                  />
                ) : (
                  <g>
                    <circle r={10} fill="#0284c7" />
                    <text x={0} y={-14} fontSize={10} textAnchor="middle" fill={colors.labelPrimary}>
                      {n.deviceId || "badgeuse"}
                    </text>
                    {n.targetDoorId && (
                      <text x={0} y={14} fontSize={9} textAnchor="middle" fill={colors.labelSecondary}>
                        ↔ {n.targetDoorId}
                      </text>
                    )}
                  </g>
                )}

                {n.deviceId && <circle r={18} fill="none" stroke={dockerOk ? "#10b981" : "#ef4444"} strokeWidth={2} opacity={0.9} />}

                {selNodeId === n.id && <circle r={16} fill="none" stroke={colors.selection} strokeDasharray="4 4" />}

                {isLoading && (
                  <g>
                    <circle r={14} fill="rgba(15,23,42,0.35)" />
                    <foreignObject x={-20} y={-10} width={40} height={20}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "40px",
                          height: "20px",
                          color: "white",
                          fontSize: "9px",
                          gap: "4px",
                        }}
                      >
                        <Spinner size={12} />
                        <span>{loadingKind === "deleting" ? "Supp..." : "Créa..."}</span>
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
  );
}
