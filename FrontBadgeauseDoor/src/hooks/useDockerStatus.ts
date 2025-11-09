import { useEffect, useState } from "react";

import { ORCH_URL } from "@/config";

type DockerStatus = Record<string, { ready: boolean; status: string }>;

export function useDockerStatus() {
  const [dockerActive, setDockerActive] = useState<DockerStatus>({});

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const r = await fetch(`${ORCH_URL}/devices`);
        if (r.ok) {
          const arr: Array<{ id: string; kind: string; status: string; ready: boolean }> = await r.json();
          if (!stop) {
            const map: DockerStatus = {};
            for (const d of arr) map[d.id] = { ready: d.ready, status: d.status };
            setDockerActive(map);
          }
        }
      } catch {
        // swallow errors, best-effort polling
      }
      if (!stop) setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, []);

  return dockerActive;
}

