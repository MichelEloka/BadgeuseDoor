import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion
from kafka import KafkaProducer, KafkaConsumer
from kafka.errors import KafkaError
import uvicorn
import os

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
log = logging.getLogger("bridge")

# ---------- Config ----------
MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
CLIENT_ID = os.getenv("CLIENT_ID", "bridge-doors")
# Topics
# Le front publie désormais sur un topic unique (sans wildcard) avec deviceId dans le payload.
BADGE_EVENTS_TOPIC = os.getenv("BADGE_EVENTS_TOPIC", "iot/badgeuse/events")
DOOR_CMDS_FMT = os.getenv("DOOR_CMDS_FMT", "iot/porte/{door_id}/events")
# Comportement
OPEN_ACTION = os.getenv("OPEN_ACTION", "open")  # "open" | "toggle"
AUTO_CLOSE_SEC = int(os.getenv("AUTO_CLOSE_SEC", "0"))  # 0 pour désactiver
DEBOUNCE_SEC = int(os.getenv("DEBOUNCE_SEC", "2"))  # anti-spam pour une même porte
# Kafka
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC_ATTEMPTS = os.getenv("KAFKA_TOPIC_ATTEMPTS", "attempts")
KAFKA_TOPIC_LOGS = os.getenv("KAFKA_TOPIC_LOGS", "logs")

# ---------- Etat ----------
connected = False
last_trigger_ts: Dict[str, float] = {}  # door_id -> timestamp
close_timers: Dict[str, threading.Timer] = {}
kafka_producer: Optional[KafkaProducer] = None


def now_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


# ---------- MQTT callbacks ----------
def on_connect(client, userdata, flags, reason_code, properties=None):
  global connected
  connected = reason_code == 0
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


def publish_door(client: mqtt.Client, door_id: str, action: str, badge_id: Optional[str]):
  topic = DOOR_CMDS_FMT.format(door_id=door_id)
  payload = {
    "doorID": door_id,
    "badgeID": badge_id or "",
    "action": action.upper(),
    "timestamp": now_iso(),
  }
  client.publish(topic, json.dumps(payload), qos=1, retain=False)
  log.info(f"[BRIDGE] -> {topic} {payload}")


def schedule_autoclose(client: mqtt.Client, door_id: str):
  if AUTO_CLOSE_SEC <= 0:
    return
  # Annule un timer existant si on re-tire pendant l'ouverture
  t = close_timers.get(door_id)
  if t and t.is_alive():
    t.cancel()

  def _close():
    publish_door(client, door_id, "close", badge_id=None)
    log.info(f"[BRIDGE] (auto-close) door={door_id}")

  timer = threading.Timer(AUTO_CLOSE_SEC, _close)
  close_timers[door_id] = timer
  timer.start()


def send_to_kafka(badge_id: str, door_id: str, device_id: str):
  if not kafka_producer:
    return
  payload = {
    "badgeID": badge_id or "",
    "doorID": door_id or "",
    "timestamp": now_iso(),
    "deviceId": device_id or "",
  }
  try:
    kafka_producer.send(KAFKA_TOPIC_ATTEMPTS, value=payload)
  except KafkaError as e:
    log.warning(f"[KAFKA] publish failed: {e}")


def _handle_kafka_log(record: dict):
  door_id = str(record.get("doorID") or record.get("doorId") or "").strip()
  if not door_id:
    return
  status = str(record.get("status") or "").upper()
  badge_id = str(record.get("badgeID") or record.get("badgeId") or record.get("badge") or "")
  device_id = str(record.get("deviceId") or record.get("device_id") or "")
  allowed = status in {"GRANTED", "ALLOWED", "ALLOW", "OK", "SUCCESS"}
  action = "open" if allowed else "close"
  log.info(f"[KAFKA->MQTT] door={door_id} badge={badge_id} status={status} action={action}")
  publish_door(client, door_id, action, badge_id)
  if allowed:
    schedule_autoclose(client, door_id)


def _start_kafka_logs_listener():
  endpoints = [addr.strip() for addr in KAFKA_BOOTSTRAP.split(",") if addr.strip()]
  if not endpoints:
    log.warning("[KAFKA] No bootstrap servers for consumer")
    return
  try:
    consumer = KafkaConsumer(
      KAFKA_TOPIC_LOGS,
      bootstrap_servers=endpoints,
      value_deserializer=lambda v: json.loads(v.decode("utf-8")),
      auto_offset_reset="latest",
      enable_auto_commit=True,
      group_id="bridge-logs",
    )
  except Exception as e:
    log.error(f"[KAFKA] Consumer init failed: {e}")
    return

  def _loop():
    log.info(f"[KAFKA] Listening on topic {KAFKA_TOPIC_LOGS}")
    for msg in consumer:
      try:
        if msg.value:
          _handle_kafka_log(msg.value)
      except Exception as e:
        log.warning(f"[KAFKA] consume error: {e}")

  th = threading.Thread(target=_loop, name="kafka-logs-consumer", daemon=True)
  th.start()
  return th


def on_message(client, userdata, msg):
  # On attend l'event JSON de la badgeuse
  log.info(f"[BRIDGE] MQTT message on {msg.topic} -> {msg.payload.decode('utf-8', errors='ignore')}")
  try:
    data = json.loads(msg.payload.decode("utf-8"))
  except Exception:
    log.warning(f"[MQTT] Non-JSON payload on {msg.topic}")
    return

  if not isinstance(data, dict):
    return
  topic_parts = msg.topic.split("/")
  badge_device_id = str(data.get("deviceId") or data.get("device_id") or "")
  if not badge_device_id and len(topic_parts) >= 3 and topic_parts[2] != "+":
    badge_device_id = topic_parts[2]

  door_id: Optional[str] = None
  badge_id: Optional[str] = None
  success = True

  if "badgeID" in data or "doorID" in data:
    badge_id = data.get("badgeID") or data.get("badgeId") or ""
    door_id = data.get("doorID") or data.get("doorId") or ""
  elif data.get("type") == "badge_event":
    inner = data.get("data") or {}
    success = bool(inner.get("success", True))
    badge_id = inner.get("badge_id") or inner.get("tag_id")
    door_id = inner.get("door_id") or inner.get("doorID")
  else:
    return

  if not success:
    log.info(f"[BRIDGE] Badge KO ignoré ({badge_device_id}, badge={badge_id})")
    return

  if not door_id:
    log.warning(f"[BRIDGE] Pas de doorID dans l'event (badgeuse={badge_device_id}, badge={badge_id})")
    return

  # Debounce par porte
  now_ts = time.time()
  last = last_trigger_ts.get(door_id, 0)
  if now_ts - last < DEBOUNCE_SEC:
    log.info(f"[BRIDGE] Debounce porte={door_id} (ignoré)")
    return
  last_trigger_ts[door_id] = now_ts

  action = OPEN_ACTION
  log.info(f"[BRIDGE] <- {msg.topic} badge_device={badge_device_id} badge={badge_id} door={door_id} action={action}")
  publish_door(client, door_id, action, badge_id)
  schedule_autoclose(client, door_id)
  log.info(f"[BRIDGE] -> Kafka topic={KAFKA_TOPIC_ATTEMPTS} payload={{'badgeID': {badge_id}, 'doorID': {door_id}, 'deviceId': {badge_device_id}}}")
  send_to_kafka(badge_id or "", door_id, badge_device_id or "")


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


# ---------- Kafka producer ----------
def _init_kafka_producer() -> Optional[KafkaProducer]:
  endpoints = [addr.strip() for addr in KAFKA_BOOTSTRAP.split(",") if addr.strip()]
  if not endpoints:
    log.warning("[KAFKA] No bootstrap servers configured, skipping producer init")
    return None
  try:
    producer = KafkaProducer(
      bootstrap_servers=endpoints,
      value_serializer=lambda v: json.dumps(v).encode("utf-8"),
      linger_ms=20,
      retries=3,
    )
    log.info(f"[KAFKA] Producer ready (bootstrap={endpoints}, topic={KAFKA_TOPIC_ATTEMPTS})")
    return producer
  except Exception as e:
    log.error(f"[KAFKA] Init failed: {e}")
    return None


kafka_producer = _init_kafka_producer()
kafka_consumer_thread = _start_kafka_logs_listener()

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
    "status": "ok",
    "mqtt_connected": connected,
    "kafka_producer": kafka_producer is not None,
  }


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "9010")))
