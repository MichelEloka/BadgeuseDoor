import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";

import { environment } from "../../../environments/environment";

export interface MediaUploadResponse {
  url: string;
}

@Injectable({ providedIn: "root" })
export class MediaService {
  constructor(private readonly http: HttpClient) {}

  uploadImage(file: File): Observable<string> {
    if (!environment.mediaApiUrl) {
      return throwError(() => new Error("Media upload endpoint not configured"));
    }
    const form = new FormData();
    form.append("file", file);
    return this.http.post<MediaUploadResponse>(environment.mediaApiUrl, form).pipe(
      map((res) => res.url),
      catchError((err) => {
        const message = err?.error?.error || err?.message || "Unable to upload media";
        return throwError(() => new Error(message));
      })
    );
  }
}
