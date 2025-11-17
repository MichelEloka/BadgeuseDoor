export const environment = {
  production: true,
  /**
   * WebSocket feed used by the cockpit.
   */
  wsUrl: "ws://172.31.249.2:9500/events",
  /**
   * Max number of monitoring entries kept in memory.
   */
  maxEntries: 200,
  /**
   * REST endpoint used to retrieve all registered users.
   */
  usersApiUrl: "http://172.31.249.2:9500/api/users",
  /**
   * REST endpoint used to delete a user by id/badge.
   */
  usersDeleteApiUrl: "http://172.31.249.2:9500/api/users/delete",
  /**
   * REST endpoint used to trigger manual door openings.
   */
  manualOverrideUrl: "http://172.31.249.2:9500/api/manual-access",
  /**
   * REST endpoint returning the door list.
   */
  doorsApiUrl: "http://172.31.249.2:9500/api/doors",
  /**
   * REST endpoint returning additional details for a log entry.
   */
  logDetailsApiUrl: "http://172.31.249.2:9500/api/logs",
  /**
   * REST endpoint returning mock devices (portes & badgeuses).
   */
  mockDevicesApiUrl: "http://172.31.249.2:9500/api/mock/devices",
};
