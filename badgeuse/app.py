import os, json
from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("badgeuse")

# --- Config MQTT / Device ------------------------------------------------
MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")   # mets host.docker.internal si broker hors-compose
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
DEVICE_ID = os.getenv("DEVICE_ID", "badgeuse-001")
DOOR_ID   = os.getenv("DOOR_ID", "")              # <— injecté par l’orchestrateur (optionnel)

def _topic_events(device_id: str) -> str:
    return f"iot/badgeuse/{device_id}/events"

def _topic_commands(device_id: str) -> str:
    return f"iot/badgeuse/{device_id}/commands"

TOPIC_EVENTS = _topic_events(DEVICE_ID)
TOPIC_CMDS   = _topic_commands(DEVICE_ID)
TOPIC_CMDS_FILTER = "iot/badgeuse/+/commands"

# --- MQTT client (API v2) ------------------------------------------------
connected = False

def _reason_success(reason_code) -> bool:
    if reason_code is None:
        return False
    if isinstance(reason_code, int):
        return reason_code == mqtt.MQTT_ERR_SUCCESS
    try:
        return int(reason_code) == mqtt.MQTT_ERR_SUCCESS
    except Exception:
        return str(reason_code).strip().lower() in {"success", "ok", "0"}

def _normalize_badge_payload(payload: dict) -> Tuple[str, Optional[str]]:
    badge_id = str(payload.get("badgeID") or payload.get("badge_id") or payload.get("tag_id") or "BADGE-TEST")
    raw_door = payload.get("doorID") or payload.get("door_id")
    door_id = str(raw_door) if raw_door not in (None, "") else (DOOR_ID or None)
    return badge_id, door_id

def _publish_badge_event(device_id: str, badge_id: str, door_id: Optional[str], origin: str):
    now = datetime.now(timezone.utc).isoformat()
    message = {
        "badgeID": badge_id,
        "doorID": door_id or "",
        "timestamp": now,
    }
    topic = _topic_events(device_id)
    info = client.publish(topic, json.dumps(message), qos=1, retain=False)
    log.info(f"[MQTT] badge_event ({origin}) -> {topic} badge={badge_id} door={door_id or '-'} device={device_id}")
    return message, info, topic

def on_connect(client, userdata, flags, reason_code, properties=None):
    global connected
    connected = _reason_success(reason_code)
    if connected:
        log.info(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT} (reason_code={reason_code})")
        client.subscribe(TOPIC_CMDS, qos=1)
        client.subscribe(TOPIC_CMDS_FILTER, qos=1)
        log.info(f"[MQTT] Subscribed to {TOPIC_CMDS} and {TOPIC_CMDS_FILTER}")
    else:
        log.error(f"[MQTT] Connect failed (reason_code={reason_code})")

def on_disconnect(client, userdata, reason_code, properties=None):
    global connected
    connected = False
    log.warning(f"[MQTT] Disconnected (reason_code={reason_code})")

def on_message(client, userdata, msg):
    raw_payload = msg.payload.decode("utf-8", errors="ignore")
    topic_parts = msg.topic.split("/")
    target_device = topic_parts[2] if len(topic_parts) >= 3 else DEVICE_ID
    log.info(f"[MQTT] cmd topic={msg.topic} device={target_device} payload={raw_payload}")
    try:
        payload = json.loads(raw_payload)
    except Exception:
        log.warning(f"[MQTT] Non JSON payload on {msg.topic}")
        return

    action = str(payload.get("action") or payload.get("type") or "").lower()
    if action not in {"badge", "simulate_badge", "badge_event"}:
        log.debug(f"[MQTT] Ignored action '{action}' on {msg.topic}")
        return

    badge_id, door_id = _normalize_badge_payload(payload.get("data") or payload)
    if not door_id:
        log.debug("[MQTT] Command without door_id, fallback to env/default")

    try:
        _publish_badge_event(target_device, badge_id, door_id, origin="mqtt-command")
    except Exception:
        log.exception("[MQTT] Unable to publish badge event from command")

def on_publish(client, userdata, mid, reason_code=mqtt.MQTT_ERR_SUCCESS, properties=None):
    if reason_code == mqtt.MQTT_ERR_SUCCESS:
        log.info(f"[MQTT] Published mid={mid}")
    else:
        log.warning(f"[MQTT] Publish mid={mid} failed (reason={reason_code})")

client = mqtt.Client(
    callback_api_version=CallbackAPIVersion.VERSION2,
    client_id=f"badgeuse-{DEVICE_ID}",
    protocol=mqtt.MQTTv311
)
if MQTT_USER:
    client.username_pw_set(MQTT_USER, MQTT_PASS)

client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_message = on_message
client.on_publish = on_publish
client.reconnect_delay_set(min_delay=1, max_delay=5)

log.info(f"[MQTT] Connecting to {MQTT_HOST}:{MQTT_PORT} …")
log.info(f"[BOOT] DEVICE_ID={DEVICE_ID} DOOR_ID={DOOR_ID or '-'} CMD_TOPIC={TOPIC_CMDS} CMD_FILTER={TOPIC_CMDS_FILTER}")
client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
client.loop_start()

# --- FastAPI --------------------------------------------------------------
app = FastAPI(title=f"Badgeuse {DEVICE_ID}")

# CORS pour le front
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adapte en prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device_id": DEVICE_ID,
        "door_id": DOOR_ID or None,
        "mqtt_connected": connected
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT","8000")))
