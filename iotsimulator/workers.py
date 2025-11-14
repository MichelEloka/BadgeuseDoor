import json
import threading
from typing import Dict, Optional

import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion

from config import MQTT_HOST, MQTT_PASS, MQTT_PORT, MQTT_USER, log, now_iso


class DeviceWorker(threading.Thread):
    def __init__(self, device_id: str, kind: str):
        super().__init__(daemon=True, name=f"{kind}-{device_id}")
        self.device_id = device_id
        self.kind = kind
        self.ready = threading.Event()
        self._stop = threading.Event()
        self.connected = False

    def stop(self) -> None:
        self._stop.set()

    def wait_ready(self, timeout: float) -> bool:
        return self.ready.wait(timeout)

    def health(self) -> Dict:
        return {"status": "ok", "device_id": self.device_id, "ready": self.ready.is_set()}


class BadgeuseWorker(DeviceWorker):
    def __init__(self, device_id: str, door_id: Optional[str]):
        super().__init__(device_id, "badgeuse")
        self.door_id = door_id
        self.client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=f"sim-badgeuse-{device_id}",
            protocol=mqtt.MQTTv311,
        )
        if MQTT_USER:
            self.client.username_pw_set(MQTT_USER, MQTT_PASS)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.command_topic = f"iot/badgeuse/{device_id}/commands"
        self.command_filter = "iot/badgeuse/+/commands"

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.connected = reason_code == 0
        if self.connected:
            log.info("[badgeuse %s] connecté à %s:%s", self.device_id, MQTT_HOST, MQTT_PORT)
            client.subscribe(self.command_topic, qos=1)
            client.subscribe(self.command_filter, qos=1)
            self.ready.set()
        else:
            log.error("[badgeuse %s] connexion refusée (%s)", self.device_id, reason_code)

    def _on_disconnect(self, client, userdata, reason_code, properties=None):
        self.connected = False
        self.ready.clear()
        log.warning("[badgeuse %s] déconnectée (%s)", self.device_id, reason_code)

    def _normalize_payload(self, payload: Dict) -> tuple[str, Optional[str]]:
        badge_id = str(payload.get("badgeID") or payload.get("badge_id") or payload.get("tag_id") or "BADGE-TEST")
        raw_door = payload.get("doorID") or payload.get("door_id")
        door_id = str(raw_door) if raw_door not in (None, "") else self.door_id
        return badge_id, door_id

    def _publish_badge_event(self, badge_id: str, door_id: Optional[str]):
        message = {
            "badgeID": badge_id,
            "doorID": door_id or "",
            "timestamp": now_iso(),
        }
        topic = f"iot/badgeuse/{self.device_id}/events"
        self.client.publish(topic, json.dumps(message), qos=1, retain=False)
        log.info("[badgeuse %s] badge=%s door=%s", self.device_id, badge_id, door_id or "-")

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            log.warning("[badgeuse %s] payload non JSON sur %s", self.device_id, msg.topic)
            return
        action = str(payload.get("action") or payload.get("type") or "").lower()
        if action not in {"badge", "simulate_badge", "badge_event"}:
            return
        badge_id, door_id = self._normalize_payload(payload.get("data") or payload)
        if not door_id:
            log.debug("[badgeuse %s] commande sans doorID", self.device_id)
        self._publish_badge_event(badge_id, door_id)

    def run(self):
        self.client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        self.client.loop_start()
        try:
            while not self._stop.wait(0.25):
                pass
        finally:
            try:
                self.client.loop_stop()
            except Exception:
                pass
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.ready.clear()

    def health(self) -> Dict:
        base = super().health()
        base.update({"door_id": self.door_id, "mqtt_connected": self.connected})
        return base


class DoorWorker(DeviceWorker):
    def __init__(self, device_id: str):
        super().__init__(device_id, "porte")
        self.client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=f"sim-porte-{device_id}",
            protocol=mqtt.MQTTv311,
        )
        if MQTT_USER:
            self.client.username_pw_set(MQTT_USER, MQTT_PASS)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.command_topic = f"iot/porte/{device_id}/commands"
        self.state_topic = f"iot/porte/{device_id}/state"
        self.state = {"is_open": False, "last_change": None}
        self._state_lock = threading.Lock()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.connected = reason_code == 0
        if self.connected:
            client.subscribe(self.command_topic, qos=1)
            self.ready.set()
            log.info("[porte %s] connectée à %s:%s", self.device_id, MQTT_HOST, MQTT_PORT)
            self._publish_state()
        else:
            log.error("[porte %s] connexion refusée (%s)", self.device_id, reason_code)

    def _on_disconnect(self, client, userdata, reason_code, properties=None):
        self.connected = False
        self.ready.clear()
        log.warning("[porte %s] déconnectée (%s)", self.device_id, reason_code)

    def _publish_state(self):
        payload = {
            "device_id": self.device_id,
            "type": "door_state",
            "ts": now_iso(),
            "data": {"is_open": self.state["is_open"]},
        }
        self.client.publish(self.state_topic, json.dumps(payload), qos=1, retain=True)

    def apply_action(self, action: str):
        action = action.lower()
        if action not in {"open", "close", "toggle"}:
            raise ValueError("Action invalide")
        with self._state_lock:
            if action == "toggle":
                self.state["is_open"] = not self.state["is_open"]
            else:
                self.state["is_open"] = action == "open"
            self.state["last_change"] = now_iso()
        if self.connected:
            self._publish_state()
        log.info("[porte %s] action=%s -> is_open=%s", self.device_id, action, self.state["is_open"])

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            log.warning("[porte %s] payload non JSON", self.device_id)
            return
        door_target = str(payload.get("doorID") or payload.get("door_id") or "").strip()
        if door_target and door_target not in {self.device_id}:
            return
        action = str(payload.get("action") or "").lower()
        if action not in {"open", "close", "toggle"}:
            return
        self.apply_action(action)

    def run(self):
        self.client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        self.client.loop_start()
        try:
            while not self._stop.wait(0.25):
                pass
        finally:
            try:
                self.client.loop_stop()
            except Exception:
                pass
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.ready.clear()

    def health(self) -> Dict:
        base = super().health()
        with self._state_lock:
            state_snapshot = dict(self.state)
        base.update(
            {
                "is_open": state_snapshot["is_open"],
                "last_change": state_snapshot["last_change"],
                "mqtt_connected": self.connected,
            }
        )
        return base
