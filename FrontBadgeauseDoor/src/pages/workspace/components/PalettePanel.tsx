import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeviceNode } from "@/types/floor";
import type { Tool } from "../types";
import { DoorOpen, Hand, KeyRound, Minus, Plus, Ruler, PenSquare } from "lucide-react";

interface PalettePanelProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  grid: number;
  onGridChange: (value: number) => void;
  thick: number;
  onThickChange: (value: number) => void;
  selNode: DeviceNode | null;
  onFlipHinge: () => void;
  onRotateDoor: () => void;
  onResetAngle: () => void;
}

export function PalettePanel({
  tool,
  onToolChange,
  grid,
  onGridChange,
  thick,
  onThickChange,
  selNode,
  onFlipHinge,
  onRotateDoor,
  onResetAngle,
}: PalettePanelProps) {
  return (
    <Card className="rounded-xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <CardContent className="space-y-3 p-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Palette</p>
          <p className="text-xs font-semibold text-slate-900 dark:text-white">Dessin & placement</p>
        </div>

        <div className="grid grid-cols-1 gap-1">
          <PaletteButton icon={<Hand className="h-4 w-4" />} label="Pan" active={tool === "pan"} onClick={() => onToolChange("pan")} />
          <PaletteButton icon={<Ruler className="h-4 w-4" />} label="Mur (ligne)" active={tool === "wall-line"} onClick={() => onToolChange("wall-line")} />
          <PaletteButton icon={<PenSquare className="h-4 w-4" />} label="Dessiner zone" active={tool === "draw-zone"} onClick={() => onToolChange("draw-zone")} />
          <PaletteButton icon={<DoorOpen className="h-4 w-4" />} label="Placer porte" active={tool === "place-porte"} onClick={() => onToolChange("place-porte")} />
          <PaletteButton icon={<KeyRound className="h-4 w-4" />} label="Placer badgeuse" active={tool === "place-badgeuse"} onClick={() => onToolChange("place-badgeuse")} />
        </div>

        <div className="grid gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/40">
          <NumberAdjust label="Grille" value={grid} onDecrement={() => onGridChange(Math.max(2, grid - 2))} onIncrement={() => onGridChange(Math.min(40, grid + 2))} />
          <NumberAdjust label="Épaisseur" value={thick} onDecrement={() => onThickChange(Math.max(2, thick - 1))} onIncrement={() => onThickChange(Math.min(20, thick + 1))} />
        </div>

        {selNode?.kind === "porte" && (
          <div className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">Porte sélectionnée</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-300 px-3 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-100" onClick={onFlipHinge}>
                Inverser (R)
              </Button>
              <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-300 px-3 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-100" onClick={onRotateDoor}>
                Tourner 90°
              </Button>
              <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-300 px-3 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-100" onClick={onResetAngle}>
                Reset angle
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaletteButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
        active ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-transparent text-slate-600 hover:border-slate-200 dark:text-slate-300"
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border text-[10px]", active ? "border-white/30 bg-white/10 text-white" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800")}>{icon}</span>
        {label}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-slate-400">{active ? "actif" : ""}</span>
    </Button>
  );
}

interface NumberAdjustProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

function NumberAdjust({ label, value, onIncrement, onDecrement }: NumberAdjustProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-white dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
          onClick={onDecrement}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-white dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
          onClick={onIncrement}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
