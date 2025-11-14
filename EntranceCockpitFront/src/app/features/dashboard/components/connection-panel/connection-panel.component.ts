import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-connection-panel",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./connection-panel.component.html",
})
export class ConnectionPanelComponent {
  @Input() wsUrl = "";
  @Input() currentUrl: string | null = null;
  @Input() isBusy = false;

  @Output() wsUrlChange = new EventEmitter<string>();
  @Output() connectRequested = new EventEmitter<void>();
  @Output() disconnectRequested = new EventEmitter<void>();
}
