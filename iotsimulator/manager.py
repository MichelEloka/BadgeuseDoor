import threading
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from workers import BadgeuseWorker, DeviceWorker, DoorWorker


@dataclass
class DeviceRecord:
    kind: Literal["badgeuse", "porte"]
    worker: DeviceWorker
    door_id: Optional[str] = None


class DeviceManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._devices: Dict[str, DeviceRecord] = {}

    def _build_worker(self, kind: str, device_id: str, door_id: Optional[str]) -> DeviceWorker:
        if kind == "badgeuse":
            return BadgeuseWorker(device_id, door_id)
        return DoorWorker(device_id)

    def ensure(self, kind: str, device_id: str, door_id: Optional[str]) -> DeviceRecord:
        to_start: Optional[DeviceWorker] = None
        to_stop: Optional[DeviceWorker] = None
        with self._lock:
            record = self._devices.get(device_id)
            if record:
                if record.kind != kind:
                    to_stop = record.worker
                new_worker = self._build_worker(kind, device_id, door_id)
                record = DeviceRecord(kind, new_worker, door_id if kind == "badgeuse" else None)
                self._devices[device_id] = record
                to_start = new_worker
            elif kind == "badgeuse" and door_id and door_id != record.door_id:
                to_stop = record.worker
                new_worker = BadgeuseWorker(device_id, door_id)
                record.worker = new_worker
                record.door_id = door_id
                to_start = new_worker
            elif not record.worker.is_alive():
                to_stop = record.worker
                new_worker = self._build_worker(kind, device_id, record.door_id)
                record.worker = new_worker
                to_start = new_worker
            else:
                new_worker = self._build_worker(kind, device_id, door_id)
                record = DeviceRecord(kind, new_worker, door_id if kind == "badgeuse" else None)
                self._devices[device_id] = record
                to_start = new_worker
        if to_stop:
            to_stop.stop()
            to_stop.join(timeout=2)
        if to_start:
            to_start.start()
        return record

    def remove(self, device_id: str) -> bool:
        with self._lock:
            record = self._devices.pop(device_id, None)
        if not record:
            return False
        record.worker.stop()
        record.worker.join(timeout=2)
        return True

    def get(self, device_id: str) -> Optional[DeviceRecord]:
        with self._lock:
            return self._devices.get(device_id)

    def list(self, kind: Optional[str] = None):
        with self._lock:
            items = []
            for device_id, record in self._devices.items():
                if kind and record.kind != kind:
                    continue
                ready = record.worker.ready.is_set()
                item = {
                    "id": device_id,
                    "kind": record.kind,
                    "status": "running" if ready else "starting",
                    "ready": ready,
                }
                if record.kind == "badgeuse":
                    item["door_id"] = record.door_id
                items.append(item)
            return items
