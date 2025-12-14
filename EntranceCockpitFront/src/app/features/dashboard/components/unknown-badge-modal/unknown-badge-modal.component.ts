import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

export interface UnknownBadgeForm {
  badgeID: string;
  firstName: string;
  lastName: string;
  imageFile?: File | null;
}

@Component({
  selector: "app-unknown-badge-modal",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./unknown-badge-modal.component.html",
})
export class UnknownBadgeModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() badgeID = "";
  @Input() loading = false;
  @Input() error: string | null = null;

  @Output() submitBadge = new EventEmitter<UnknownBadgeForm>();
  @Output() close = new EventEmitter<void>();

  form: UnknownBadgeForm = {
    badgeID: "",
    firstName: "",
    lastName: "",
    imageFile: null,
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["badgeID"]) {
      this.form = { ...this.form, badgeID: this.badgeID };
    }
    if (changes["visible"] && !this.visible) {
      this.form = { badgeID: this.badgeID, firstName: "", lastName: "", imageFile: null };
    }
  }

  handleSubmit() {
    const badgeID = this.form.badgeID.trim();
    const firstName = this.form.firstName.trim();
    const lastName = this.form.lastName.trim();
    this.submitBadge.emit({ badgeID, firstName, lastName, imageFile: this.form.imageFile ?? null });
  }

  handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    this.form = { ...this.form, imageFile: file };
  }
}
