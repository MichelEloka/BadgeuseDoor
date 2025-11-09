import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/Spinner";

interface MqttSettingsCardProps {
  mqttUrl: string;
  onMqttUrlChange: (value: string) => void;
  connected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function MqttSettingsCard({ mqttUrl, onMqttUrlChange, connected, isConnecting, onConnect, onDisconnect }: MqttSettingsCardProps) {
  return (
    <Card className="rounded-2xl border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60">
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex flex-1 flex-col gap-1 min-w-[220px]">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">MQTT WS URL</span>
          <Input
            className="rounded-2xl border-slate-200/80 bg-white/80 text-sm focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/70"
            value={mqttUrl}
            onChange={(e) => onMqttUrlChange(e.target.value)}
            placeholder="ws://localhost:9001"
          />
          <div className="text-xs text-slate-400 dark:text-slate-500">Topics: iot/badgeuse/+/events, iot/porte/+/state</div>
        </div>
        <div className="flex flex-col gap-2">
          <StatusBadge connected={connected} isConnecting={isConnecting} />
          <Button className="rounded-full px-4" onClick={connected ? onDisconnect : onConnect} disabled={isConnecting}>
            {isConnecting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} /> Connexion…
              </span>
            ) : connected ? (
              "Déconnecter"
            ) : (
              "Se connecter"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ connected, isConnecting }: { connected: boolean; isConnecting: boolean }) {
  const text = isConnecting ? "Connexion…" : connected ? "Connecté" : "Déconnecté";
  const color = isConnecting ? "bg-amber-50 text-amber-600 border-amber-200" : connected ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-rose-50 text-rose-600 border-rose-200";
  const dot = isConnecting ? "bg-amber-400 animate-pulse" : connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${color} dark:bg-transparent dark:text-white/80`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </div>
  );
}
