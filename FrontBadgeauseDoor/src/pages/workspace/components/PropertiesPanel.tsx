import { ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/Spinner";
import type { DirectoryUser } from "@/api/directory";
import type { DeviceNode, Floor } from "@/types/floor";
import { DoorClosed, DoorOpen, KeyRound, Trash2 } from "lucide-react";

interface PropertiesPanelProps {
  selNode: DeviceNode | null;
  floor: Floor;
  loadingMap: Record<string, "creating" | "deleting" | undefined>;
  onUpdateNode: (nodeId: string, patch: Partial<DeviceNode>) => void;
  onEnsureService: (node: DeviceNode) => void;
  onDeleteNode: (node: DeviceNode) => void;
  onLinkDoor: (node: DeviceNode, doorId: string) => void;
  onBadge: (node: DeviceNode, badgeId: string) => void;
  onDoorAction: (node: DeviceNode, action: "open" | "close" | "toggle") => void;
  doorCatalog: string[];
  badgeCatalog: DirectoryUser[];
}

export function PropertiesPanel({
  selNode,
  floor,
  loadingMap,
  onUpdateNode,
  onDeleteNode,
  onLinkDoor,
  onBadge,
  onDoorAction,
  doorCatalog,
  badgeCatalog,
}: PropertiesPanelProps) {
  const loadingKind = selNode?.deviceId ? loadingMap[selNode.deviceId] : undefined;
  const normalizedBadges = useMemo(
    () =>
      badgeCatalog.map((user) => ({
        value: user.badgeID || user.id,
        label: `${user.firstName} ${user.lastName} (${user.badgeID || user.id})`,
      })),
    [badgeCatalog]
  );
  const [selectedBadgeId, setSelectedBadgeId] = useState("");
  const [selectedDoorId, setSelectedDoorId] = useState("");

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

  useEffect(() => {
    if (!doorCatalog.length) {
      setSelectedDoorId("");
      return;
    }
    const preferred = selNode?.targetDoorId;
    if (preferred && doorCatalog.includes(preferred)) {
      setSelectedDoorId(preferred);
      return;
    }
    if (!selectedDoorId || !doorCatalog.includes(selectedDoorId)) {
      setSelectedDoorId(doorCatalog[0]);
    }
  }, [doorCatalog, selNode?.targetDoorId, selectedDoorId, selNode?.id]);

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
            {selNode.kind === "porte" && <SummaryCard label="Localisation" value={selNode.location || "Aucune zone détectée"} />}
            {selNode.kind === "badgeuse" && (
              <SummaryCard
                label="Porte liée"
                value={selNode.targetDoorId ? selNode.targetDoorId : "Non liée (choisir une porte)"}
              />
            )}

            <Field label="deviceId">
              <Input
                value={selNode.deviceId || "Création..."}
                readOnly
                placeholder={selNode.kind === "porte" ? "porte-XYZ" : "badgeuse-ABC"}
                className="h-8 rounded-2xl border-slate-200/70 bg-white/85 px-3 text-[11px] focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/70"
              />
            </Field>

            {selNode.kind === "badgeuse" && (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                <Field label="Lier à une porte">
                  <div className="flex gap-2">
                    <select
                      value={selectedDoorId}
                      onChange={(e) => setSelectedDoorId(e.target.value)}
                      className="h-8 flex-1 rounded-2xl border-slate-200 bg-white px-3 text-[11px] focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900/70"
                      disabled={!doorCatalog.length}
                    >
                      {!doorCatalog.length && <option value="">Aucune porte disponible</option>}
                      {doorCatalog.map((door) => (
                        <option key={door} value={door}>
                          {door}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      className="h-8 rounded-2xl border border-slate-200 bg-white/90 px-3 text-[11px] text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
                      disabled={!selectedDoorId || !!loadingKind}
                      onClick={() => selectedDoorId && onLinkDoor(selNode, selectedDoorId)}
                    >
                      Lier
                    </Button>
                  </div>
                </Field>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
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
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-1 text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100">
      <p className="text-[9px] uppercase tracking-[0.3em] opacity-70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
