import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Moon, Server, Sun, Wifi } from "lucide-react";

interface TopBarProps {
  connected: boolean;
  showConn: boolean;
  onToggleConn: () => void;
  showLogs: boolean;
  onToggleLogs: () => void;
  dark: boolean;
  onDarkChange: (value: boolean) => void;
}

export function TopBar({ connected, showConn, onToggleConn, showLogs, onToggleLogs, dark, onDarkChange }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900/85">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400 text-sm font-semibold text-white shadow-lg shadow-sky-500/40">
              IoT
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Badgeuse Workspace</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Supervision plan &amp; devices</p>
            </div>
          </div>
          <StatusBadge connected={connected} />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ToggleButton label="MQTT" icon={Wifi} active={showConn} onClick={onToggleConn} />
          <ToggleButton label="Logs" icon={Server} active={showLogs} onClick={onToggleLogs} />
          <ThemeToggle value={dark} onToggle={onDarkChange} />
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition",
        connected
          ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          : "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
      <span className="hidden sm:inline">{connected ? "MQTT connecté" : "MQTT hors-ligne"}</span>
      <span className="sm:hidden">{connected ? "En ligne" : "Hors-ligne"}</span>
    </div>
  );
}

interface ToggleButtonProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}

function ToggleButton({ label, icon: Icon, active, onClick }: ToggleButtonProps) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-9 rounded-full border px-3 text-xs font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
        active
          ? "border-slate-300 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
          : "border-transparent hover:border-slate-200 hover:bg-white/80 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
      )}
      onClick={onClick}
    >
      <Icon className="mr-1.5 h-4 w-4" />
      {label}
      {active ? <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" /> : <ChevronRight className="ml-1 h-3.5 w-3.5 opacity-70" />}
    </Button>
  );
}

interface ThemeToggleProps {
  value: boolean;
  onToggle: (next: boolean) => void;
}

function ThemeToggle({ value, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!value)}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-slate-600"
    >
      <Sun className={cn("h-4 w-4 transition", value ? "text-slate-400" : "text-amber-400")} />
      <span>{value ? "Mode sombre" : "Mode clair"}</span>
      <Moon className={cn("h-4 w-4 transition", value ? "text-indigo-400" : "text-slate-400")} />
    </button>
  );
}
