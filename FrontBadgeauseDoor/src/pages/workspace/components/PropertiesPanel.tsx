import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/utils";
import type { DeviceNode, Floor } from "@/types/floor";
import { DoorClosed, DoorOpen, KeyRound, Trash2 } from "lucide-react";

interface PropertiesPanelProps {
  selNode: DeviceNode | null;
  floor: Floor;
  loadingMap: Record<string, "creating" | "deleting" | undefined>;
  onUpdateNode: (nodeId: string, patch: Partial<DeviceNode>) => void;
  onEnsureService: (node: DeviceNode) => void;
  onDeleteNode: (node: DeviceNode) => void;
  onBadge: (node: DeviceNode) => void;
  onDoorAction: (node: DeviceNode, action: "open" | "close" | "toggle") => void;
}

export function PropertiesPanel({
  selNode,
  floor,
  loadingMap,
  onUpdateNode,
  onEnsureService,
  onDeleteNode,
  onBadge,
  onDoorAction,
}: PropertiesPanelProps) {
  const doorOptions = floor.nodes.filter((n) => n.kind === "porte" && n.deviceId);
  const loadingKind = selNode?.deviceId ? loadingMap[selNode.deviceId] : undefined;

  return (
    <Card className="rounded-xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <CardContent className="space-y-2.5 p-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">Propriétés</p>
          <p className="text-xs font-semibold text-slate-900 dark:text-white">Device & actions</p>
        </div>
        {!selNode && <div className="text-xs text-slate-500 dark:text-slate-400">Sélectionne une porte ou une badgeuse…</div>}
        {selNode && (
          <div className="space-y-2.5">
            <SummaryCard label="Type" value={selNode.kind === "porte" ? "PORTE" : "BADGEUSE"} />

            <Field label="deviceId">
              <Input
                value={selNode.deviceId || ""}
                onChange={(e) => onUpdateNode(selNode.id, { deviceId: e.target.value })}
                placeholder={selNode.kind === "porte" ? "porte-XYZ" : "badgeuse-ABC"}
                className="h-8 rounded-2xl border-slate-200/70 bg-white/85 px-3 text-[11px] focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/70"
              />
            </Field>

            {selNode.kind === "badgeuse" && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                <Field label="Porte liée (deviceId)">
                  <Input
                    value={selNode.targetDoorId || ""}
                    onChange={(e) => onUpdateNode(selNode.id, { targetDoorId: e.target.value || undefined })}
                    placeholder="porte-001"
                    className="h-8 rounded-2xl border-cyan-200/60 bg-white/90 px-3 text-[11px] focus-visible:ring-cyan-500 dark:border-cyan-500/40 dark:bg-slate-900/50"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {doorOptions.map((door) => (
                    <Button
                      key={door.id}
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-7 rounded-xl border px-2.5 text-[11px] font-medium transition",
                        door.deviceId === selNode.targetDoorId ? "border-slate-900 bg-white text-slate-900 dark:text-slate-100" : "border-transparent text-slate-600 hover:border-slate-300 dark:text-slate-300"
                      )}
                      onClick={() => onUpdateNode(selNode.id, { targetDoorId: door.deviceId })}
                    >
                      Lier {door.deviceId}
                    </Button>
                  ))}
                  {!doorOptions.length && <div className="text-xs text-cyan-600/80 dark:text-cyan-200/80">Aucune porte avec deviceId connu.</div>}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                className="h-7 rounded-full bg-slate-900 px-3 text-[11px] text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                onClick={() => selNode.deviceId && onEnsureService(selNode)}
                disabled={
                  !selNode.deviceId || !!loadingKind || (selNode.kind === "badgeuse" && !selNode.targetDoorId)
                }
                title={selNode.kind === "badgeuse" && !selNode.targetDoorId ? "Lie d'abord une porte (targetDoorId)" : undefined}
              >
                {selNode.deviceId && loadingKind === "creating" ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={16} /> Création…
                  </span>
                ) : (
                  "Créer / Assurer"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full border border-slate-300 px-3 text-[11px] text-slate-600 hover:bg-white dark:border-slate-600 dark:text-slate-200"
                onClick={() => onDeleteNode(selNode)}
                disabled={!!loadingKind}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Supprimer
              </Button>
            </div>

            {selNode.kind === "badgeuse" && (
              <Button size="sm" className="h-7 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100" onClick={() => selNode.deviceId && onBadge(selNode)} disabled={!selNode.deviceId || !!loadingKind}>
                <KeyRound className="h-4 w-4 mr-1" />
                Badger TEST1234
              </Button>
            )}

            {selNode.kind === "porte" && (
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  className="h-7 flex-1 rounded-2xl border border-slate-300 bg-white/90 px-2.5 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200"
                  onClick={() => selNode.deviceId && onDoorAction(selNode, "open")}
                  disabled={!selNode.deviceId || !!loadingKind}
                >
                  <DoorOpen className="h-4 w-4 mr-1" />
                  Ouvrir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 flex-1 rounded-2xl border border-slate-200/70 bg-white/90 px-2.5 text-[11px] text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                  onClick={() => selNode.deviceId && onDoorAction(selNode, "close")}
                  disabled={!selNode.deviceId || !!loadingKind}
                >
                  <DoorClosed className="h-4 w-4 mr-1" />
                  Fermer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 flex-1 rounded-2xl border border-slate-200/70 bg-white/90 px-2.5 text-[11px] text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                  onClick={() => selNode.deviceId && onDoorAction(selNode, "toggle")}
                  disabled={!selNode.deviceId || !!loadingKind}
                >
                  Toggle
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  const palette = "border-slate-200 bg-white/80 text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100";
  return (
    <div className={cn("rounded-2xl border px-3 py-1", palette)}>
      <p className="text-[9px] uppercase tracking-[0.3em] opacity-70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
