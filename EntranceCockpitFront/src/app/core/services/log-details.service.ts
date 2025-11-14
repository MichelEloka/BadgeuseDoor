import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import { environment } from "../../../environments/environment";
import type { LogDetailsResponse } from "../models/log-details.model";

@Injectable({ providedIn: "root" })
export class LogDetailsService {
  constructor(private readonly http: HttpClient) {}

  fetchDetails(logId: string): Observable<LogDetailsResponse> {
    const id = logId.trim();
    if (!id) {
      return throwError(() => new Error("Log identifier is required"));
    }
    if (!environment.logDetailsApiUrl) {
      return throwError(() => new Error("Log details endpoint not configured"));
    }
    const base = environment.logDetailsApiUrl.replace(/\/+$/, "");
    const url = `${base}/${encodeURIComponent(id)}`;
    return this.http.get<LogDetailsResponse>(url).pipe(
      catchError((err) => {
        const message = err?.error?.message || err.message || "Unable to retrieve log details";
        return throwError(() => new Error(message));
      })
    );
  }
}
