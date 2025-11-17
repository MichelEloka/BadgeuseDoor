import { useMemo } from "react";

export type DockerStatus = Record<string, { ready: boolean; status: string }>;

/**
 * Les états des capteurs sont désormais stockés avec le plan (backend Java),
 * donc on ne tente plus d'interroger l'orchestrateur à intervalle régulier.
 * On renvoie simplement une map vide pour éviter les erreurs réseau répétées.
 */
export function useDockerStatus(): DockerStatus {
  return useMemo(() => ({}), []);
}

