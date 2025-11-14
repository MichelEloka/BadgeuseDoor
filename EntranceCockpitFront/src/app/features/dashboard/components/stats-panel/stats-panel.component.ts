import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import type { MonitoringEntry } from "../../../../core/models/monitoring-entry.model";

export interface DashboardStats {
  total: number;
  success: number;
  failure: number;
}

@Component({
  selector: "app-stats-panel",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./stats-panel.component.html",
})
export class StatsPanelComponent {
  @Input() stats: DashboardStats = { total: 0, success: 0, failure: 0 };
  @Input() latestSuccess: MonitoringEntry | null = null;
}
