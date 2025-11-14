import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";

import { AppComponent } from "./app.component";
import { LogStreamService } from "./core/services/log-stream.service";
import type { MonitoringEntry, ConnectionState } from "./core/models/monitoring-entry.model";

class MockLogStreamService {
  logs$ = new BehaviorSubject<MonitoringEntry[]>([]);
  connectionState$ = new BehaviorSubject<ConnectionState>("idle");
  lastError$ = new BehaviorSubject<string | null>(null);
  currentUrl$ = new BehaviorSubject<string | null>(null);
  connect() {}
  disconnect() {}
  clear() {}
}

describe("AppComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: LogStreamService, useClass: MockLogStreamService }],
    }).compileComponents();
  });

  it("should create the app", () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it("should render the dashboard page", () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector("app-dashboard-page")).toBeTruthy();
  });
});
