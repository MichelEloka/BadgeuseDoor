import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { LogDetailsState } from "../../../../core/models/log-details.model";
import type { MonitoringEntry } from "../../../../core/models/monitoring-entry.model";

@Component({
  selector: "app-logs-panel",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./logs-panel.component.html",
})
export class LogsPanelComponent {
  @Input() title = "Event feed";
  @Input() logs: MonitoringEntry[] = [];
  @Input() lastError: string | null = null;
  @Input() emptyLabel = "No event yet.";
  @Input() controls = true;
  @Input() expandedLogId: string | null = null;
  @Input() logDetails: Record<string, LogDetailsState> = {};

  @Output() clearRequested = new EventEmitter<void>();
  @Output() reconnectRequested = new EventEmitter<void>();
  @Output() logSelected = new EventEmitter<MonitoringEntry>();

  get successLogs(): MonitoringEntry[] {
    return this.logs.filter((log) => log.status === "success");
  }

  get failureLogs(): MonitoringEntry[] {
    return this.logs.filter((log) => log.status === "failure");
  }

  trackById(_index: number, entry: MonitoringEntry): string {
    return entry.id;
  }

  describe(entry: MonitoringEntry): string {
    const data = (entry.payload?.data as Record<string, unknown> | undefined) ?? {};
    const badge = entry.badgeID ?? this.pickString(data, "badgeID", "badge_id") ?? "Unknown badge";
    const door = entry.doorID ?? this.pickString(data, "doorID", "door_id") ?? "Unknown door";
    const device = entry.deviceId ?? this.pickString(data, "deviceId", "device_id") ?? "Unknown device";
    return `${badge} · ${door} · ${device}`;
  }

  formatStatus(entry: MonitoringEntry): string {
    if (entry.status === "success") return "Accès autorisé";
    if (entry.status === "failure") return "Accès refusé";
    return "Événement";
  }

  isExpanded(entry: MonitoringEntry): boolean {
    return !!this.expandedLogId && this.expandedLogId === entry.id;
  }

  selectLog(entry: MonitoringEntry, event?: Event): void {
    if (event) event.stopPropagation();
    this.logSelected.emit(entry);
  }

  detailsFor(entry: MonitoringEntry): LogDetailsState | null {
    return this.logDetails[entry.id] ?? null;
  }

  badgeOwnerLabel(entry: MonitoringEntry): string | null {
    const details = this.detailsFor(entry);
    if (!details || !details.users || !details.users.length) {
      return null;
    }
    const normalized = (entry.badgeID ?? "").trim().toUpperCase();
    const match =
      normalized.length > 0
        ? details.users.find((user) => (user.badgeID ?? "").trim().toUpperCase() === normalized)
        : undefined;
    const candidate = match ?? details.users[0];
    const first = (candidate.firstName ?? "").trim();
    const last = (candidate.lastName ?? "").trim();
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    return fullName || candidate.badgeID || null;
  }

  private pickString(source: Record<string, unknown> | undefined, ...keys: string[]): string | null {
    if (!source) return null;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return null;
  }
}
