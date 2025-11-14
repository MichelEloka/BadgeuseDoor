import { CommonModule, DOCUMENT } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from "@angular/core";
import { FormsModule, NgForm } from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom } from "rxjs";

import { environment } from "../../../environments/environment";
import type { MonitoringEntry } from "../../core/models/monitoring-entry.model";
import type { UserProfile } from "../../core/models/user-profile.model";
import { LogStreamService } from "../../core/services/log-stream.service";
import { LogDetailsService } from "../../core/services/log-details.service";
import { ManualOverrideService, type ManualOverridePayload } from "../../core/services/manual-override.service";
import { DoorDirectoryService } from "../../core/services/door-directory.service";
import { UserDirectoryService } from "../../core/services/user-directory.service";
import { TopBarComponent } from "../../shared/ui/top-bar/top-bar.component";
import { LogsPanelComponent } from "./components/logs-panel/logs-panel.component";
import { ManualAccessPanelComponent } from "./components/manual-access-panel/manual-access-panel.component";
import { StatsPanelComponent } from "./components/stats-panel/stats-panel.component";
import type { DashboardStats } from "./components/stats-panel/stats-panel.component";
import type { LogDetailsState } from "../../core/models/log-details.model";
import { UnknownBadgeModalComponent } from "./components/unknown-badge-modal/unknown-badge-modal.component";
import type { UnknownBadgeForm } from "./components/unknown-badge-modal/unknown-badge-modal.component";

interface ToastMessage {
  id: string;
  log: MonitoringEntry;
  createdAt: number;
}

@Component({
  selector: "app-dashboard-page",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TopBarComponent,
    ManualAccessPanelComponent,
    LogsPanelComponent,
    StatsPanelComponent,
    UnknownBadgeModalComponent,
  ],
  templateUrl: "./dashboard-page.component.html",
  styleUrls: ["./dashboard-page.component.scss"],
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  private readonly logStream = inject(LogStreamService);
  private readonly logDetailsService = inject(LogDetailsService);
  private readonly manualOverride = inject(ManualOverrideService);
  private readonly doorDirectory = inject(DoorDirectoryService);
  private readonly userDirectory = inject(UserDirectoryService);
  private readonly document = inject(DOCUMENT);
  private readonly hasWindow = typeof window !== "undefined";
  private readonly wsUrl = environment.wsUrl;

  readonly logs = toSignal(this.logStream.logs$, { initialValue: [] as MonitoringEntry[] });
  readonly connectionState = toSignal(this.logStream.connectionState$, { initialValue: "idle" });
  readonly lastError = toSignal(this.logStream.lastError$, { initialValue: null as string | null });
  readonly darkMode = signal(this.getInitialDarkMode());
  readonly users = signal<UserProfile[]>([]);
  readonly usersLoading = signal(false);
  readonly usersError = signal<string | null>(null);
  readonly doors = signal<string[]>([]);
  readonly doorsError = signal<string | null>(null);
  readonly manualLoading = signal(false);
  readonly manualSuccess = signal<string | null>(null);
  readonly manualError = signal<string | null>(null);
  readonly showManualModal = signal(false);
  readonly showUnknownModal = signal(false);
  readonly pendingBadgeId = signal<string | null>(null);
  readonly unknownLoading = signal(false);
  readonly unknownError = signal<string | null>(null);
  readonly refusedListCollapsed = signal(false);
  readonly expandedPanel = signal<"all" | "accepted" | "denied" | null>(null);
  readonly expandedLogId = signal<string | null>(null);
  readonly toastMessages = signal<ToastMessage[]>([]);
  readonly addUserLoading = signal(false);
  readonly deleteUserId = signal<string | null>(null);
  readonly showAddUserModal = signal(false);
  readonly showUsersModal = signal(false);
  readonly logDetailsById = signal<Record<string, LogDetailsState>>({});

  private readonly notifiedLogIds = new Set<string>();
  private toastHydrated = false;
  private readonly toastTimers = new Map<string, number>();
  private readonly logDetailsRequests = new Set<string>();
  newUserForm = { badgeID: "", firstName: "", lastName: "" };

  readonly knownBadges = computed(() => {
    const set = new Set<string>();
    for (const user of this.users()) {
      if (user.badgeID) {
        set.add(user.badgeID.toUpperCase());
      }
    }
    return set;
  });

  readonly acceptedLogs = computed(() => this.logs().filter((log) => log.status === "success"));
  readonly deniedLogs = computed(() => this.logs().filter((log) => log.status === "failure"));
  readonly stats = computed<DashboardStats>(() => {
    const entries = this.logs();
    const success = entries.filter((log) => log.status === "success").length;
    const failure = entries.filter((log) => log.status === "failure").length;
    return { total: entries.length, success, failure };
  });
  readonly latestSuccess = computed<MonitoringEntry | null>(
    () => this.logs().find((log) => log.status === "success") ?? null
  );

  constructor() {
    effect(() => {
      const isDark = this.darkMode();
      this.document?.documentElement.classList.toggle("dark", isDark);
      if (this.hasWindow) {
        try {
          window.localStorage.setItem("entrance-cockpit-theme", isDark ? "dark" : "light");
        } catch {
          // ignore storage issues
        }
      }
    });

    effect(
      () => {
        const entries = this.logs();
        if (!this.toastHydrated) {
          entries.forEach((entry) => this.notifiedLogIds.add(entry.id));
          this.toastHydrated = true;
          return;
        }
        for (const entry of entries) {
          if (!this.notifiedLogIds.has(entry.id)) {
            this.notifiedLogIds.add(entry.id);
            this.enqueueToast(entry);
          }
        }
      },
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.connect();
    void this.loadDoors();
    void this.loadUsers();
  }

  ngOnDestroy(): void {
    this.logStream.disconnect();
    this.toastTimers.forEach((timer) => {
      if (this.hasWindow) {
        window.clearTimeout(timer);
      } else {
        clearTimeout(timer);
      }
    });
    this.toastTimers.clear();
  }

  toggleTheme() {
    this.darkMode.update((value) => !value);
  }

  openAddUserModal() {
    if (!this.users().length && !this.usersLoading()) {
      void this.loadUsers();
    }
    this.newUserForm = { badgeID: "", firstName: "", lastName: "" };
    this.usersError.set(null);
    this.showAddUserModal.set(true);
  }

  closeAddUserModal() {
    if (!this.addUserLoading()) {
      this.showAddUserModal.set(false);
    }
  }

  openUsersModal() {
    if (!this.users().length && !this.usersLoading()) {
      void this.loadUsers();
    }
    this.showUsersModal.set(true);
  }

  closeUsersModal() {
    this.showUsersModal.set(false);
  }

  toggleRefusedList() {
    this.refusedListCollapsed.update((value) => !value);
  }

  togglePanelExpansion(panel: "all" | "accepted" | "denied") {
    this.expandedPanel.set(this.expandedPanel() === panel ? null : panel);
  }

  closeExpandedPanel() {
    this.expandedPanel.set(null);
  }

  handleLogClick(entry: MonitoringEntry) {
    const current = this.expandedLogId();
    const next = current === entry.id ? null : entry.id;
    this.expandedLogId.set(next);
    if (next) {
      void this.ensureLogDetails(next);
    }
  }

  handleDeniedBadgeDoubleClick(entry: MonitoringEntry) {
    if (!entry.badgeID) {
      return;
    }
    this.openUnknownBadge(entry.badgeID);
  }

  connect() {
    this.logStream.connect(this.wsUrl);
  }

  disconnect() {
    this.logStream.disconnect();
  }

  clearLogs() {
    this.logStream.clear();
  }

  private async loadDoors() {
    this.doorsError.set(null);
    try {
      const list = await firstValueFrom(this.doorDirectory.fetchDoors());
      this.doors.set(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch doors";
      this.doorsError.set(message);
    }
  }

  private async loadUsers() {
    this.usersLoading.set(true);
    this.usersError.set(null);
    try {
      const list = await firstValueFrom(this.userDirectory.fetchUsers());
      this.users.set(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch users";
      this.usersError.set(message);
    } finally {
      this.usersLoading.set(false);
    }
  }

  async handleManualAccess(payload: ManualOverridePayload) {
    const selectedDoor = payload.doorID?.trim();
    if (!selectedDoor) {
      this.manualError.set("Veuillez sélectionner une porte.");
      this.manualSuccess.set(null);
      return;
    }
    this.manualLoading.set(true);
    this.manualError.set(null);
    this.manualSuccess.set(null);
    try {
      const result = await firstValueFrom(this.manualOverride.trigger({ doorID: selectedDoor }));
      const door = result.doorID ? `Porte ${result.doorID}` : "Porte";
      this.manualSuccess.set(`${door} ouverte manuellement.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "L'ouverture manuelle a échoué";
      this.manualError.set(message);
    } finally {
      this.manualLoading.set(false);
    }
  }

  async registerUnknownBadge(form: UnknownBadgeForm) {
    const badgeID = form.badgeID.trim();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!badgeID || !firstName || !lastName) {
      this.unknownError.set("All fields are required.");
      return;
    }
    this.unknownLoading.set(true);
    this.unknownError.set(null);
    try {
      await firstValueFrom(this.userDirectory.registerUser({ badgeID, firstName, lastName }));
      await this.loadUsers();
      this.showUnknownModal.set(false);
      this.pendingBadgeId.set(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to register badge";
      this.unknownError.set(message);
    } finally {
      this.unknownLoading.set(false);
    }
  }

  closeUnknownBadgeModal() {
    this.showUnknownModal.set(false);
    this.pendingBadgeId.set(null);
    this.unknownError.set(null);
  }

  async handleCreateUser(
    payload: { firstName: string; lastName: string; badgeID: string },
    options: { closeModal?: boolean } = {}
  ) {
    const badgeID = payload.badgeID.trim();
    const firstName = payload.firstName.trim();
    const lastName = payload.lastName.trim();
    if (!badgeID || !firstName || !lastName) {
      this.usersError.set("Badge, prénom et nom sont requis.");
      return;
    }
    this.addUserLoading.set(true);
    this.usersError.set(null);
    try {
      await firstValueFrom(this.userDirectory.registerUser({ badgeID, firstName, lastName }));
      await this.loadUsers();
      if (options.closeModal) {
        this.showAddUserModal.set(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to register user";
      this.usersError.set(message);
    } finally {
      this.addUserLoading.set(false);
    }
  }

  async handleDeleteUser(user: UserProfile) {
    const target = (user.id || user.badgeID || "").trim();
    if (!target) {
      return;
    }
    this.deleteUserId.set(target);
    this.usersError.set(null);
    try {
      await firstValueFrom(this.userDirectory.deleteUser(target));
      await this.loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete user";
      this.usersError.set(message);
    } finally {
      this.deleteUserId.set(null);
    }
  }

  openManualModal() {
    this.manualSuccess.set(null);
    this.manualError.set(null);
    this.showManualModal.set(true);
  }

  closeManualModal() {
    this.showManualModal.set(false);
  }

  async submitAddUser(form: NgForm) {
    const payload = {
      badgeID: this.newUserForm.badgeID.trim(),
      firstName: this.newUserForm.firstName.trim(),
      lastName: this.newUserForm.lastName.trim(),
    };
    if (!payload.badgeID || !payload.firstName || !payload.lastName) {
      this.usersError.set("Tous les champs sont requis.");
      return;
    }
    await this.handleCreateUser(payload, { closeModal: true });
    if (!this.addUserLoading()) {
      form.resetForm();
      this.newUserForm = { badgeID: "", firstName: "", lastName: "" };
    }
  }

  dismissToast(toastId: string) {
    this.toastMessages.update((current) => current.filter((toast) => toast.id !== toastId));
    const timer = this.toastTimers.get(toastId);
    if (timer !== undefined) {
      if (this.hasWindow) {
        window.clearTimeout(timer);
      } else {
        clearTimeout(timer);
      }
      this.toastTimers.delete(toastId);
    }
  }

  private openUnknownBadge(badgeID: string) {
    this.pendingBadgeId.set(badgeID);
    this.unknownError.set(null);
    this.showUnknownModal.set(true);
  }

  connectionLabel(): string {
    const state = this.connectionState();
    switch (state) {
      case "connected":
        return "Feed connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return "Feed interrupted";
      default:
        return "Idle";
    }
  }

  private getInitialDarkMode(): boolean {
    if (!this.hasWindow) {
      return false;
    }
    try {
      const stored = window.localStorage.getItem("entrance-cockpit-theme");
      if (stored === "dark" || stored === "light") {
        return stored === "dark";
      }
    } catch {
      // ignore
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  }

  private enqueueToast(entry: MonitoringEntry) {
    this.toastMessages.update((current) => [{ id: entry.id, log: entry, createdAt: Date.now() }, ...current].slice(0, 6));
    if (this.hasWindow) {
      const timer = window.setTimeout(() => this.dismissToast(entry.id), 6000);
      this.toastTimers.set(entry.id, timer);
    }
  }

  private updateLogDetailsState(logId: string, patch: Partial<LogDetailsState>) {
    this.logDetailsById.update((current) => {
      const previous = current[logId] ?? { loading: false, error: null, users: [] };
      return {
        ...current,
        [logId]: {
          ...previous,
          ...patch,
          users: patch.users ?? previous.users,
        },
      };
    });
  }

  private async ensureLogDetails(logId: string) {
    if (!logId || this.logDetailsRequests.has(logId)) {
      return;
    }
    const snapshot = this.logDetailsById();
    if (snapshot[logId] && snapshot[logId].users.length && !snapshot[logId].error) {
      return;
    }
    this.logDetailsRequests.add(logId);
    this.updateLogDetailsState(logId, { loading: true, error: null });
    try {
      const result = await firstValueFrom(this.logDetailsService.fetchDetails(logId));
      this.updateLogDetailsState(logId, {
        loading: false,
        users: Array.isArray(result.users) ? result.users : [],
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load related users";
      this.updateLogDetailsState(logId, { loading: false, error: message });
    } finally {
      this.logDetailsRequests.delete(logId);
    }
  }
}
