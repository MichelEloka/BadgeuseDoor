import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import { environment } from "../../../environments/environment";

@Injectable({ providedIn: "root" })
export class DoorDirectoryService {
  constructor(private readonly http: HttpClient) {}

  fetchDoors(): Observable<string[]> {
    if (!environment.doorsApiUrl) {
      return throwError(() => new Error("Door endpoint not configured"));
    }
    return this.http.get<string[]>(environment.doorsApiUrl).pipe(
      catchError((err) => {
        const message = err?.error?.message || err.message || "Unable to retrieve doors";
        return throwError(() => new Error(message));
      })
    );
  }
}
