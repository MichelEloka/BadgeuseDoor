import { ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/api/mockDirectory";
import type { DeviceNode, Floor } from "@/types/floor";
import { DoorClosed, DoorOpen, KeyRound, Trash2 } from "lucide-react";

interface PropertiesPanelProps {
  selNode: DeviceNode | null;
  floor: Floor;
  loadingMap: Record<string, "creating" | "deleting" | undefined>;
  onUpdateNode: (nodeId: string, patch: Partial<DeviceNode>) => void;
  onEnsureService: (node: DeviceNode) => void;
  onDeleteNode: (node: DeviceNode) => void;
  onBadge: (node: DeviceNode, badgeId: string) => void;
  onDoorAction: (node: DeviceNode, action: "open" | "close" | "toggle") => void;
  doorCatalog: string[];
  badgeCatalog: MockUser[];
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
  doorCatalog,
  badgeCatalog,
}: PropertiesPanelProps) {
  const doorOptionsFromFloor = floor.nodes.filter((n) => n.kind === "porte" && n.deviceId);
  const loadingKind = selNode?.deviceId ? loadingMap[selNode.deviceId] : undefined;
  const doorCatalogOptions = useMemo(() => {
    const base = doorCatalog.map((id) => ({ value: id, label: id }));
    if (selNode?.kind === "porte" && selNode.deviceId && !base.some((item) => item.value === selNode.deviceId)) {
      base.push({ value: selNode.deviceId, label: selNode.deviceId });
    }
    return base;
  }, [doorCatalog, selNode?.deviceId, selNode?.kind]);
  const normalizedBadges = useMemo(
    () =>
      badgeCatalog.map((user) => ({
        value: user.badgeID || user.id,
        label: `${user.firstName} ${user.lastName} (${user.badgeID || user.id})`,
      })),
    [badgeCatalog]
  );
  const [selectedBadgeId, setSelectedBadgeId] = useState("");

  useEffect(() => {
    if (!badgeCatalog.length) {
      setSelectedBadgeId("");
      return;
    }
    const fallback = badgeCatalog[0].badgeID || badgeCatalog[0].id;
    if (!selectedBadgeId || !badgeCatalog.some((b) => (b.badgeID || b.id) === selectedBadgeId)) {
      setSelectedBadgeId(fallback);
    }
  }, [badgeCatalog, selectedBadgeId, selNode?.id]);

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
              {selNode.kind === "porte" ? (
                <select
                  value={selNode.deviceId || ""}
                  onChange={(e) => onUpdateNode(selNode.id, { deviceId: e.target.value || undefined })}
                  className="h-9 w-full rounded-2xl border border-slate-200 bg-white/85 px-3 text-[11px] focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/70"
                >
                  <option value="">Choisir une porte</option>
                  {doorCatalogOptions.map((door) => (
                    <option key={door.value} value={door.value}>
                      {door.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={selNode.deviceId || ""}
                  readOnly
                  placeholder={selNode.kind === "porte" ? "porte-XYZ" : "badgeuse-ABC"}
                  className="h-8 rounded-2xl border-slate-200/70 bg-white/85 px-3 text-[11px] focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/70"
                />
              )}
              {selNode.kind === "porte" && !doorCatalogOptions.length && <p className="text-[10px] text-amber-500">Aucune porte disponible (mock API).</p>}
            </Field>

            {selNode.kind === "badgeuse" && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                <Field label="Porte liée (deviceId)">
                  <select
                    value={selNode.targetDoorId || ""}
                    onChange={(e) => onUpdateNode(selNode.id, { targetDoorId: e.target.value || undefined })}
                    className="h-8 w-full rounded-2xl border-cyan-200/60 bg-white/90 px-3 text-[11px] focus-visible:ring-cyan-500 dark:border-cyan-500/40 dark:bg-slate-900/50"
                  >
                    <option value="">Choisir une porte</option>
                    {doorCatalogOptions.map((door) => (
                      <option key={door.value} value={door.value}>
                        {door.label}
                      </option>
                    ))}
                  </select>
                  {!doorCatalogOptions.length && <p className="text-[10px] text-cyan-600 dark:text-cyan-200">Liste des portes vide.</p>}
                </Field>
                <div className="flex flex-wrap gap-2">
                  {doorOptionsFromFloor.map((door) => (
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
                  {!doorOptionsFromFloor.length && <div className="text-xs text-cyan-600/80 dark:text-cyan-200/80">Aucune porte placée sur le plan.</div>}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                className="h-7 rounded-full bg-slate-900 px-3 text-[11px] text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                onClick={() => selNode.deviceId && onEnsureService(selNode)}
                disabled={!selNode.deviceId || !!loadingKind || (selNode.kind === "badgeuse" && !selNode.targetDoorId)}
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
                <Trash2 className="mr-1 h-4 w-4" />
                Supprimer
              </Button>
            </div>

            {selNode.kind === "badgeuse" && (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                <Field label="Badge à simuler">
                  <select
                    value={selectedBadgeId}
                    onChange={(e) => setSelectedBadgeId(e.target.value)}
                    className="h-8 w-full rounded-2xl border-slate-200 bg-white px-3 text-[11px] focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900/70"
                    disabled={!normalizedBadges.length}
                  >
                    {!normalizedBadges.length && <option value="">Aucun badge disponible</option>}
                    {normalizedBadges.map((badge) => (
                      <option key={badge.value} value={badge.value}>
                        {badge.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  size="sm"
                  className="h-7 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
                  onClick={() => selNode.deviceId && selectedBadgeId && onBadge(selNode, selectedBadgeId)}
                  disabled={!selNode.deviceId || !!loadingKind || !selectedBadgeId}
                >
                  <KeyRound className="mr-1 h-4 w-4" />
                  {selectedBadgeId ? `Badger ${selectedBadgeId}` : "Badge indisponible"}
                </Button>
              </div>
            )}

            {selNode.kind === "porte" && (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  className="h-7 flex-1 rounded-2xl border border-slate-300 bg-white/90 px-2.5 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200"
                  onClick={() => selNode.deviceId && onDoorAction(selNode, "open")}
                  disabled={!selNode.deviceId || !!loadingKind}
                >
                  <DoorOpen className="mr-1 h-4 w-4" />
                  Ouvrir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 flex-1 rounded-2xl border border-slate-200/70 bg-white/90 px-2.5 text-[11px] text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                  onClick={() => selNode.deviceId && onDoorAction(selNode, "close")}
                  disabled={!selNode.deviceId || !!loadingKind}
                >
                  <DoorClosed className="mr-1 h-4 w-4" />
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
