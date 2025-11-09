import { Card, CardContent } from "@/components/ui/card";

interface LogsPanelProps {
  logs: { ts: number; topic: string; payload: string }[];
}

export function LogsPanel({ logs }: LogsPanelProps) {
  return (
    <Card className="rounded-xl border">
      <CardContent className="pt-4">
        <div className="text-xs font-medium mb-2 text-slate-500 dark:text-slate-400">Logs MQTT (dernier en haut)</div>
        <div className="max-h-64 overflow-auto text-[10px] font-mono rounded-lg border bg-white/80 dark:bg-slate-900/70 logs-scroll thin-scrollbar">
          {logs.map((l, i) => {
            let parsed: Record<string, any> | null = null;
            try {
              parsed = JSON.parse(l.payload);
            } catch {
              parsed = null;
            }
            return (
              <div
                key={`${l.ts}-${i}`}
                className="px-2 py-0.5 border-b border-slate-200/40 dark:border-slate-800/40 text-slate-600 dark:text-slate-200 bg-white/60 dark:bg-slate-900/40"
              >
                <div className="flex gap-2">
                  <span className="shrink-0 opacity-60">{new Date(l.ts).toLocaleTimeString()}</span>
                  <span className="shrink-0 text-slate-500 dark:text-slate-400">{l.topic}</span>
                  <span className="truncate text-slate-700 dark:text-slate-100">{l.payload}</span>
                </div>
                {parsed && (
                  <pre className="mt-1 rounded bg-white/50 px-2 py-1 text-[9px] leading-4 text-slate-600 dark:bg-slate-900/60 dark:text-slate-200 overflow-x-auto thin-scrollbar">
                    {JSON.stringify(parsed, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          {!logs.length && <div className="px-3 py-6 text-center opacity-60">Aucun log…</div>}
        </div>
      </CardContent>
    </Card>
  );
}
