import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import { environment } from "../../../environments/environment";
import type { UserProfile } from "../models/user-profile.model";

@Injectable({ providedIn: "root" })
export class UserDirectoryService {
  constructor(private readonly http: HttpClient) {}

  fetchUsers(): Observable<UserProfile[]> {
    if (!environment.usersApiUrl) {
      return throwError(() => new Error("User endpoint not configured"));
    }
    return this.http.get<UserProfile[]>(environment.usersApiUrl).pipe(
      catchError((err) => {
        const message = err?.error?.message || err.message || "Unable to retrieve users";
        return throwError(() => new Error(message));
      })
    );
  }

  registerUser(payload: { firstName: string; lastName: string; badgeID: string }): Observable<UserProfile> {
    if (!environment.usersApiUrl) {
      return throwError(() => new Error("User endpoint not configured"));
    }
    return this.http.post<UserProfile>(environment.usersApiUrl, payload).pipe(
      catchError((err) => {
        const message = err?.error?.message || err.message || "Unable to register user";
        return throwError(() => new Error(message));
      })
    );
  }

  deleteUser(userId: string): Observable<void> {
    const target = userId.trim();
    if (!target) {
      return throwError(() => new Error("User identifier is required"));
    }
    const base = environment.usersDeleteApiUrl || environment.usersApiUrl;
    if (!base) {
      return throwError(() => new Error("Delete endpoint not configured"));
    }
    let url = base;
    if (base.includes(":id")) {
      url = base.replace(":id", encodeURIComponent(target));
    } else {
      url = base.replace(/\/+$/, "");
      url = `${url}/${encodeURIComponent(target)}`;
    }
    return this.http.delete<void>(url).pipe(
      catchError((err) => {
        const message = err?.error?.message || err.message || "Unable to delete user";
        return throwError(() => new Error(message));
      })
    );
  }
}
