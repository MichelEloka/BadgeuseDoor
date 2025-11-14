import { Component } from "@angular/core";

import { DashboardPageComponent } from "./features/dashboard/dashboard-page.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [DashboardPageComponent],
  template: `<app-dashboard-page />`,
})
export class AppComponent {}
