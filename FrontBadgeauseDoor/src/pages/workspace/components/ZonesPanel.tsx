import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ZoneShape } from "@/types/floor";

interface ZonesPanelProps {
  zones: ZoneShape[];
  showBorders: boolean;
  showFill: boolean;
  onToggleBorders: () => void;
  onToggleFill: () => void;
  onRename: (zoneId: string, name: string) => void;
  onDelete: (zoneId: string) => void;
  autoFocusZoneId?: string | null;
  onAutoFocusConsumed?: () => void;
}

export function ZonesPanel({
  zones,
  showBorders,
  showFill,
  onToggleBorders,
  onToggleFill,
  onRename,
  onDelete,
  autoFocusZoneId,
  onAutoFocusConsumed,
}: ZonesPanelProps) {
  const [editing, setEditing] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getValue = (zone: ZoneShape) => editing[zone.id] ?? zone.name ?? "";

  const handleChange = (zone: ZoneShape, value: string) => {
    setEditing((prev) => ({ ...prev, [zone.id]: value }));
  };

  const handleBlur = (zone: ZoneShape) => {
    const value = getValue(zone).trim();
    onRename(zone.id, value);
  };

  useEffect(() => {
    if (!autoFocusZoneId) return;
    const target = inputRefs.current[autoFocusZoneId];
    if (target) {
      requestAnimationFrame(() => {
        target.focus();
        target.select();
        onAutoFocusConsumed?.();
      });
    }
  }, [autoFocusZoneId, onAutoFocusConsumed, zones.length]);

  return (
    <Card className="rounded-xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">Zones</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Espaces tracés</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Utilise l’outil “Dessiner zone” pour délimiter un espace.</p>
          </div>
          <div className="ml-auto flex flex-col gap-1">
            <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-300 px-3 text-[11px]" onClick={onToggleBorders}>
              {showBorders ? "Masquer traits" : "Afficher traits"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-300 px-3 text-[11px]" onClick={onToggleFill}>
              {showFill ? "Masquer fond" : "Afficher fond"}
            </Button>
          </div>
        </div>
        {!zones.length && <div className="text-xs text-slate-500 dark:text-slate-400">Aucune zone définie.</div>}
        {zones.map((zone, index) => (
          <div key={zone.id} className="rounded-lg border border-slate-200/70 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Zone {index + 1}</p>
            <Input
              ref={(el) => {
                inputRefs.current[zone.id] = el;
              }}
              value={getValue(zone)}
              onChange={(e) => handleChange(zone, e.target.value)}
              onBlur={() => handleBlur(zone)}
              placeholder="Nom de la zone"
              className="mt-1 h-8 rounded-xl border-slate-200 text-xs dark:border-slate-600"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Portes liées :</span>{" "}
              {zone.doorIds?.length ? zone.doorIds.join(", ") : "Aucune"}
            </p>
            <div className="mt-2 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{zone.points.length} sommets</span>
              <Button size="sm" variant="ghost" className="h-6 rounded-full px-2 text-[11px]" onClick={() => onDelete(zone.id)}>
                Supprimer
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
