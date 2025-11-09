# bridge/app.py
import os, json, logging, threading
from datetime import datetime, timezone
from typing import Optional, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion
import uvicorn

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
log = logging.getLogger("bridge")

# ---------- Config ----------
MQTT_HOST   = os.getenv("MQTT_HOST", "mosquitto")           # "host.docker.internal" si broker hors-compose
MQTT_PORT   = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER   = os.getenv("MQTT_USER", "")
MQTT_PASS   = os.getenv("MQTT_PASS", "")
CLIENT_ID   = os.getenv("CLIENT_ID", "bridge-doors")
# Topics
BADGE_EVENTS_TOPIC = os.getenv("BADGE_EVENTS_TOPIC", "iot/badgeuse/+/events")  # wildcard
DOOR_CMDS_FMT      = os.getenv("DOOR_CMDS_FMT", "iot/porte/{door_id}/commands")
# Comportement
OPEN_ACTION        = os.getenv("OPEN_ACTION", "open")        # "open" | "toggle"
AUTO_CLOSE_SEC     = int(os.getenv("AUTO_CLOSE_SEC", "5"))   # 0 pour désactiver
DEBOUNCE_SEC       = int(os.getenv("DEBOUNCE_SEC", "2"))     # anti-spam pour une même porte

# ---------- État ----------
connected = False
last_trigger_ts: Dict[str, float] = {}     # door_id -> timestamp
close_timers: Dict[str, threading.Timer] = {}

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ---------- MQTT callbacks ----------
def on_connect(client, userdata, flags, reason_code, properties=None):
    global connected
    connected = (reason_code == 0)
    if connected:
        log.info(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT}")
        client.subscribe(BADGE_EVENTS_TOPIC, qos=1)
        log.info(f"[MQTT] Subscribed {BADGE_EVENTS_TOPIC}")
    else:
        log.error(f"[MQTT] Connect failed: {reason_code}")

def on_disconnect(client, userdata, reason_code, properties=None):
    global connected
    connected = False
    log.warning(f"[MQTT] Disconnected: {reason_code}")

def publish_door(client: mqtt.Client, door_id: str, action: str, badge_device_id: str, tag_id: Optional[str], success: bool):
    topic = DOOR_CMDS_FMT.format(door_id=door_id)
    payload = {
        "action": action,
        "source": "bridge",
        "ts": now_iso(),
        "data": {
            "badge_device_id": badge_device_id,
            "tag_id": tag_id,
            "success": success
        }
    }
    client.publish(topic, json.dumps(payload), qos=1, retain=False)
    log.info(f"[BRIDGE] -> {topic} {payload}")

def schedule_autoclose(client: mqtt.Client, door_id: str):
    if AUTO_CLOSE_SEC <= 0:
        return
    # Annule un timer existant si on re-tire pendant l’ouverture
    t = close_timers.get(door_id)
    if t and t.is_alive():
        t.cancel()

    def _close():
        topic = DOOR_CMDS_FMT.format(door_id=door_id)
        payload = {"action": "close", "source": "bridge", "ts": now_iso()}
        client.publish(topic, json.dumps(payload), qos=1, retain=False)
        log.info(f"[BRIDGE] (auto-close) -> {topic} {payload}")

    timer = threading.Timer(AUTO_CLOSE_SEC, _close)
    close_timers[door_id] = timer
    timer.start()

def on_message(client, userdata, msg):
    # On attend l’event JSON de la badgeuse
    try:
        data = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        log.warning(f"[MQTT] Non-JSON payload on {msg.topic}")
        return

    # Format attendu (cf. ta badgeuse):
    # {
    #   "device_id": "badgeuse-XXX",
    #   "type": "badge_event",
    #   "ts": "...",
    #   "data": { "tag_id": "...", "success": true, "door_id": "porte-YYY" }
    # }
    if not isinstance(data, dict) or data.get("type") != "badge_event":
        return

    badge_device_id = str(data.get("device_id", ""))
    d = data.get("data") or {}
    success = bool(d.get("success", True))
    door_id = d.get("door_id")
    tag_id = d.get("tag_id")

    if not success:
        log.info(f"[BRIDGE] Badge KO ignoré ({badge_device_id}, tag={tag_id})")
        return

    if not door_id:
        log.warning(f"[BRIDGE] Pas de door_id dans l'event (badge={badge_device_id}, tag={tag_id})")
        return

    # Debounce par porte
    import time
    now = time.time()
    last = last_trigger_ts.get(door_id, 0)
    if now - last < DEBOUNCE_SEC:
        log.info(f"[BRIDGE] Debounce porte={door_id} (ignoré)")
        return
    last_trigger_ts[door_id] = now

    action = OPEN_ACTION
    publish_door(client, door_id, action, badge_device_id, tag_id, success)
    schedule_autoclose(client, door_id)

# ---------- MQTT client ----------
client = mqtt.Client(
    callback_api_version=CallbackAPIVersion.VERSION2,
    client_id=CLIENT_ID,
    protocol=mqtt.MQTTv311
)
if MQTT_USER:
    client.username_pw_set(MQTT_USER, MQTT_PASS)

client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_message = on_message
client.reconnect_delay_set(min_delay=1, max_delay=5)

log.info(f"[MQTT] Connecting to {MQTT_HOST}:{MQTT_PORT} …")
client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
client.loop_start()

# ---------- FastAPI ----------
app = FastAPI(title="Bridge Badgeuse -> Portes")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "ok": True,
        "mqtt_connected": connected,
        "subscribe": BADGE_EVENTS_TOPIC,
        "door_cmds_fmt": DOOR_CMDS_FMT,
        "auto_close_sec": AUTO_CLOSE_SEC,
        "debounce_sec": DEBOUNCE_SEC,
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "9010")))
