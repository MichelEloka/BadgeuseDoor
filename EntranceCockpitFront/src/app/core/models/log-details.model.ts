export interface LogDetailsUser {
  id?: string;
  firstName: string;
  lastName: string;
  badgeID?: string;
}

export interface LogDetailsResponse {
  id: string;
  users: LogDetailsUser[];
}

export interface LogDetailsState {
  loading: boolean;
  error: string | null;
  users: LogDetailsUser[];
}
