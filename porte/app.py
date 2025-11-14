import os, json, threading, logging
from datetime import datetime, timezone
from fastapi import FastAPI
from pydantic import BaseModel
import paho.mqtt.client as mqtt
import uvicorn

MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
DEVICE_ID = os.getenv("DEVICE_ID", "porte-001")
TOPIC_STATE = f"iot/porte/{DEVICE_ID}/state"
TOPIC_CMDS  = f"iot/porte/{DEVICE_ID}/commands"

state = {"is_open": False, "last_change": None}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def publish_state(client):
    payload = {
        "device_id": DEVICE_ID,
        "type": "door_state",
        "ts": now_iso(),
        "data": {"is_open": state["is_open"]}
    }
    client.publish(TOPIC_STATE, json.dumps(payload), qos=1, retain=True)

def on_connect(client, userdata, flags, rc, properties=None):
    client.subscribe(TOPIC_CMDS, qos=1)
    publish_state(client)

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        return

    action = str(data.get("action") or "").lower()
    if action not in {"open", "close", "toggle"}:
        return

    target = str(data.get("doorID") or data.get("door_id") or "").strip()
    if target and target not in {DEVICE_ID}:
        log.debug(f"[MQTT] Ignored command for {target} on {DEVICE_ID}")
        return

    log.info(f"[MQTT] cmd topic={msg.topic} action={action} door={target or DEVICE_ID}")
    if action == "toggle":
        state["is_open"] = not state["is_open"]
    else:
        state["is_open"] = (action == "open")
    state["last_change"] = now_iso()
    publish_state(client)

client = mqtt.Client(client_id=f"porte-{DEVICE_ID}", protocol=mqtt.MQTTv311)
if MQTT_USER:
    client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
client.loop_start()

app = FastAPI(title=f"Porte {DEVICE_ID}")

@app.get("/state")
def get_state():
    return {"device_id": DEVICE_ID, **state}

@app.post("/open")
def open_door():
    state["is_open"] = True
    state["last_change"] = now_iso()
    publish_state(client)
    return {"ok": True, **state}

@app.post("/close")
def close_door():
    state["is_open"] = False
    state["last_change"] = now_iso()
    publish_state(client)
    return {"ok": True, **state}

@app.post("/toggle")
def toggle_door():
    state["is_open"] = not state["is_open"]
    state["last_change"] = now_iso()
    publish_state(client)
    return {"ok": True, **state}

@app.get("/health")
def health():
    return {"status": "ok", "device_id": DEVICE_ID}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT","8001")))
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("porte")
