import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { ConnectionState } from "../../../core/models/monitoring-entry.model";

@Component({
  selector: "app-top-bar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./top-bar.component.html",
  styleUrls: ["./top-bar.component.scss"],
})
export class TopBarComponent {
  @Input() brandTitle = "Entrance Cockpit";
  @Input() brandSubtitle = "Real-time monitoring & alerts";
  @Input() connectionState: ConnectionState = "idle";
  @Input() statusLabel = "Idle";
  @Input() showUsers = false;
  @Input() darkMode = false;

  @Output() usersToggle = new EventEmitter<void>();
  @Output() themeToggle = new EventEmitter<void>();

  get statusClass(): "ok" | "ko" | "warn" {
    if (this.connectionState === "connected") {
      return "ok";
    }
    if (this.connectionState === "connecting" || this.connectionState === "idle") {
      return "warn";
    }
    return "ko";
  }
}
