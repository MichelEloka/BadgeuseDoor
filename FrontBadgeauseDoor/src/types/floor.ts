export type Wall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick?: number;
};

export type Box = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  thick?: number;
};

export type Hinge = "left" | "right";

export type DeviceNode = {
  id: string;
  kind: "porte" | "badgeuse";
  deviceId?: string;
  x: number;
  y: number;
  rot?: number;
  hinge?: Hinge;
  /** Porte liée pour badgeuse (deviceId de la porte) */
  targetDoorId?: string;
};

export type SimPerson = {
  id: string;
  firstName: string;
  lastName: string;
  badgeId: string;
  badgeFrequencySec?: number;
};

export type Floor = {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: Wall[];
  boxes: Box[];
  nodes: DeviceNode[];
  simPersons?: SimPerson[];
};

export interface BadgeEventPayload {
  device_id: string;
  type: "badge_event";
  ts: string;
  data: { badge_id: string; success: boolean; door_id?: string };
}
