import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

export interface ManualAccessForm {
  doorID: string;
}

@Component({
  selector: "app-manual-access-panel",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./manual-access-panel.component.html",
})
export class ManualAccessPanelComponent implements OnChanges {
  @Input() loading = false;
  @Input() successMessage: string | null = null;
  @Input() errorMessage: string | null = null;
  @Input() doors: string[] = [];
  @Input() doorsError: string | null = null;
  @Input() visible = false;

  @Output() submitForm = new EventEmitter<ManualAccessForm>();
  @Output() close = new EventEmitter<void>();

  form: ManualAccessForm = {
    doorID: "",
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["doors"] && this.doors.length && !this.form.doorID) {
      this.form.doorID = this.doors[0];
    }
  }

  handleSubmit() {
    const trimmed = {
      doorID: this.form.doorID?.trim() ?? "",
    };
    this.submitForm.emit(trimmed);
  }

  reset() {
    this.form = { doorID: "" };
  }

  handleClose() {
    this.close.emit();
  }
}
