import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";

import { environment } from "../../../environments/environment";

export interface ManualOverridePayload {
  doorID: string;
}

export interface ManualOverrideResult {
  status: "accepted" | "error";
  message: string;
  doorID?: string;
}

@Injectable({ providedIn: "root" })
export class ManualOverrideService {
  constructor(private readonly http: HttpClient) {}

  trigger(payload: ManualOverridePayload): Observable<ManualOverrideResult> {
    if (!environment.manualOverrideUrl) {
      return throwError(() => new Error("Manual override endpoint not configured"));
    }
    return this.http.post<{ status?: string; message?: string; doorID?: string }>(environment.manualOverrideUrl, payload).pipe(
      map((res) => ({
        status: (res.status as ManualOverrideResult["status"]) || "accepted",
        message: res.message || "Ouverture de porte déclenchée",
        doorID: res.doorID,
      })),
      catchError((err) => {
        const msg = err?.error?.message || err.message || "Impossible d'ouvrir la porte";
        return throwError(() => new Error(msg));
      })
    );
  }
}
