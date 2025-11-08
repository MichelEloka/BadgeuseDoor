import os, json
from datetime import datetime, timezone
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("badgeuse")

MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")      # mets bien host.docker.internal si broker hors-compose
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
DEVICE_ID = os.getenv("DEVICE_ID", "badgeuse-001")
TOPIC_EVENTS = f"iot/badgeuse/{DEVICE_ID}/events"
TOPIC_CMDS   = f"iot/badgeuse/{DEVICE_ID}/commands"

# --- MQTT client (API v2) ------------------------------------------------
connected = False

def on_connect(client, userdata, flags, reason_code, properties=None):
    global connected
    connected = (reason_code == 0)
    if connected:
        log.info(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT} (reason_code={reason_code})")
    else:
        log.error(f"[MQTT] Connect failed (reason_code={reason_code})")

def on_disconnect(client, userdata, reason_code, properties=None):
    global connected
    connected = False
    log.warning(f"[MQTT] Disconnected (reason_code={reason_code})")

def on_publish(client, userdata, mid):
    log.info(f"[MQTT] Published mid={mid}")

client = mqtt.Client(
    callback_api_version=CallbackAPIVersion.VERSION2,
    client_id=f"badgeuse-{DEVICE_ID}",
    protocol=mqtt.MQTTv311
)
if MQTT_USER:
    client.username_pw_set(MQTT_USER, MQTT_PASS)

client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_publish = on_publish
client.reconnect_delay_set(min_delay=1, max_delay=5)

log.info(f"[MQTT] Connecting to {MQTT_HOST}:{MQTT_PORT} …")
client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
client.loop_start()

# --- FastAPI --------------------------------------------------------------
app = FastAPI(title=f"Badgeuse {DEVICE_ID}")

# CORS: évite les 405 sur PRE-FLIGHT depuis ton front
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adapte si besoin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/badge")
def simulate_badge(payload: dict = Body(default={"tag_id": "TEST1234"})):
    tag_id = str(payload.get("tag_id", "TEST1234"))
    success = bool(payload.get("success", True))
    now = datetime.now(timezone.utc).isoformat()

    message = {
        "device_id": DEVICE_ID,
        "type": "badge_event",
        "ts": now,
        "data": {"tag_id": tag_id, "success": success}
    }

    if not connected:
        # on publie quand même : Paho mettra en file d'attente si pas connecté,
        # mais on informe le client HTTP que le broker n'est pas joignable
        info = client.publish(TOPIC_EVENTS, json.dumps(message), qos=1, retain=False)
        log.warning("[MQTT] Not connected yet, message queued")
        raise HTTPException(status_code=503, detail={"queued": True, "message": message})

    info = client.publish(TOPIC_EVENTS, json.dumps(message), qos=1, retain=False)
    # attendre l'envoi (2s max) pour détecter un échec
    ok = info.wait_for_publish(timeout=2.0)
    if not ok:
        log.error("[MQTT] Publish timeout")
        raise HTTPException(status_code=504, detail="MQTT publish timeout")

    return {"published_to": TOPIC_EVENTS, "message": message}

@app.get("/health")
def health():
    return {"status": "ok", "device_id": DEVICE_ID, "mqtt_connected": connected}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT","8000")))
