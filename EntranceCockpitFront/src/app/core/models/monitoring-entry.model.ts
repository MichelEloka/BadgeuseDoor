export type ConnectionState = "idle" | "connecting" | "connected" | "error";
export type MonitoringStatus = "success" | "failure" | "info";

export interface MonitoringPayload {
  ts?: string;
  timestamp?: string;
  device_id?: string;
  deviceId?: string;
  data?: {
    success?: boolean;
    badgeID?: string;
    badge_id?: string;
    doorID?: string;
    door_id?: string;
    firstName?: string;
    first_name?: string;
    lastName?: string;
    last_name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MonitoringEntry {
  id: string;
  timestamp: number;
  isoTimestamp: string;
  badgeID: string | null;
  doorID: string | null;
  deviceId: string | null;
  status: MonitoringStatus;
  topic: string;
  message: string;
  raw: string;
  payload: MonitoringPayload | null;
}
