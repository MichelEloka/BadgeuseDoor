/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const config = {
  wsUrl: process.env.ENTRANCE_FRONT_WS_URL || "ws://localhost:9500/events",
  usersApiUrl: process.env.ENTRANCE_FRONT_USERS_API_URL || "http://localhost:9500/api/users",
  usersDeleteApiUrl:
    process.env.ENTRANCE_FRONT_USERS_DELETE_API_URL || "http://localhost:9500/api/users/delete",
  manualOverrideUrl:
    process.env.ENTRANCE_FRONT_MANUAL_OVERRIDE_URL || "http://localhost:9500/api/manual-access",
  doorsApiUrl: process.env.ENTRANCE_FRONT_DOORS_API_URL || "http://localhost:9500/api/doors",
  logDetailsApiUrl: process.env.ENTRANCE_FRONT_LOG_DETAILS_API_URL || "http://localhost:9500/api/logs",
  mockDevicesApiUrl: process.env.ENTRANCE_FRONT_MOCK_DEVICES_API_URL || "http://localhost:9500/api/devices",
  maxEntries: Number(process.env.ENTRANCE_FRONT_MAX_ENTRIES || "200"),
};

const genEnvFile = (isProd) => `export const environment = {
  production: ${isProd},
  wsUrl: "${config.wsUrl}",
  maxEntries: ${config.maxEntries},
  usersApiUrl: "${config.usersApiUrl}",
  usersDeleteApiUrl: "${config.usersDeleteApiUrl}",
  manualOverrideUrl: "${config.manualOverrideUrl}",
  doorsApiUrl: "${config.doorsApiUrl}",
  logDetailsApiUrl: "${config.logDetailsApiUrl}",
  mockDevicesApiUrl: "${config.mockDevicesApiUrl}",
};
`;

const envDir = path.join(__dirname, "..", "src", "environments");

fs.writeFileSync(path.join(envDir, "environment.ts"), genEnvFile(true));
fs.writeFileSync(path.join(envDir, "environment.development.ts"), genEnvFile(false));

console.log("[generate-env] environment files updated with:", config);
