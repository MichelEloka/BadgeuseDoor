import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "../../../environments/environment";
import { Observable } from "rxjs";

export interface MockDeviceRecord {
  id: string;
  type: string;
  createdAt: string;
  builtin: boolean;
  location?: string | null;
  zone?: string | null;
}

@Injectable({ providedIn: "root" })
export class MockDeviceService {
  private readonly baseUrl = environment.mockDevicesApiUrl;

  constructor(private readonly http: HttpClient) {}

  fetchDevices(): Observable<MockDeviceRecord[]> {
    if (!this.baseUrl) {
      throw new Error("mockDevicesApiUrl is not configured");
    }
    return this.http.get<MockDeviceRecord[]>(this.baseUrl);
  }

  fetchDevice(deviceId: string): Observable<MockDeviceRecord> {
    if (!this.baseUrl) {
      throw new Error("mockDevicesApiUrl is not configured");
    }
    const target = `${this.baseUrl}/${encodeURIComponent(deviceId)}`;
    return this.http.get<MockDeviceRecord>(target);
  }

  deleteDevice(deviceId: string): Observable<void> {
    if (!this.baseUrl) {
      throw new Error("mockDevicesApiUrl is not configured");
    }
    const target = `${this.baseUrl}/${encodeURIComponent(deviceId)}`;
    return this.http.delete<void>(target);
  }
}
