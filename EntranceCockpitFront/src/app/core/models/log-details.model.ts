export interface LogDetailsUser {
  id?: string;
  firstName: string;
  lastName: string;
  badgeID?: string;
  imageUrl?: string | null;
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
