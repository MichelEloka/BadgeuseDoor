import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { SimPerson } from "@/types/floor";

interface SimulationPanelProps {
  persons: SimPerson[];
  onAddPerson: (person: Omit<SimPerson, "id">) => void;
  onRemovePerson: (id: string) => void;
  onUpdatePerson: (id: string, patch: Partial<SimPerson>) => void;
  running: boolean;
  canRun: boolean;
  onToggleSimulation: () => void;
}

export function SimulationPanel({ persons, onAddPerson, onRemovePerson, onUpdatePerson, running, canRun, onToggleSimulation }: SimulationPanelProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [frequency, setFrequency] = useState(5);

  const handleAdd = () => {
    if (!firstName.trim() || !lastName.trim() || !badgeId.trim() || frequency <= 0) return;
    onAddPerson({ firstName: firstName.trim(), lastName: lastName.trim(), badgeId: badgeId.trim(), badgeFrequencySec: frequency });
    setFirstName("");
    setLastName("");
    setBadgeId("");
    setFrequency(5);
  };

  return (
    <Card className="rounded-xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Simulation</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Personnes</p>
          </div>
          <Button size="sm" className="ml-auto rounded-full px-3 shrink-0" disabled={!canRun} onClick={onToggleSimulation}>
            {running ? "Arrêter" : "Lancer"}
          </Button>
        </div>

        <div className="space-y-2">
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Prénom"
            className="h-8 rounded-lg border-slate-200 text-xs dark:border-slate-600"
          />
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" className="h-8 rounded-lg border-slate-200 text-xs dark:border-slate-600" />
          <div className="flex flex-wrap gap-2">
            <Input
              value={badgeId}
              onChange={(e) => setBadgeId(e.target.value)}
              placeholder="badge_id"
              className="h-8 flex-1 min-w-[140px] rounded-lg border-slate-200 text-xs dark:border-slate-600"
            />
            <Input
              type="number"
              min={1}
              value={frequency}
              onChange={(e) => setFrequency(Math.max(1, Number(e.target.value) || 1))}
              placeholder="fréq (s)"
              className="h-8 w-24 rounded-lg border-slate-200 text-xs dark:border-slate-600"
            />
            <Button size="sm" className="rounded-lg px-4 shrink-0" onClick={handleAdd}>
              Ajouter
            </Button>
          </div>
        </div>

        <div className="space-y-1 max-h-40 overflow-auto thin-scrollbar">
          {persons.map((p) => (
            <div key={p.id} className="space-y-1 rounded-lg border border-slate-100 px-2 py-1 text-[11px] dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-100">
                    {p.firstName} {p.lastName}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{p.badgeId}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs shrink-0" onClick={() => onRemovePerson(p.id)}>
                  Retirer
                </Button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span>Fréquence (s)</span>
                <Input
                  type="number"
                  min={1}
                  value={p.badgeFrequencySec ?? 5}
                  onChange={(e) => onUpdatePerson(p.id, { badgeFrequencySec: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-7 w-20 rounded-md border-slate-200 text-[10px] dark:border-slate-600"
                />
              </div>
            </div>
          ))}
          {!persons.length && <div className="text-[10px] text-slate-500 dark:text-slate-400">Aucune personne.</div>}
        </div>
        {!canRun && <p className="text-[10px] text-amber-500">Ajoute au moins une personne et une badgeuse active pour lancer.</p>}
      </CardContent>
    </Card>
  );
}
