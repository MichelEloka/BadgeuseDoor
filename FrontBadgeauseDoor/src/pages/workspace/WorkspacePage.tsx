import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createOrchestratorDevice, deleteDeviceOnOrch, doorCmd, fetchPlan, pollUntilReady, savePlan } from "@/api/orchestrator";
import {
  deleteDirectoryDevice,
  fetchDirectoryDevices,
  fetchDirectoryUsers,
  fetchDoorIds,
  updateDirectoryDevice,
  type DirectoryDeviceRecord,
  type DirectoryUser,
} from "@/api/directory";
import { ORCH_URL, MQTT_WS_URL_DEFAULT } from "@/config";
