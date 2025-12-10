import os
import json
import logging
import random
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from kafka import KafkaConsumer, KafkaProducer
import uvicorn

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
log = logging.getLogger("core-operational-backend")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC_ATTEMPTS = os.getenv("KAFKA_TOPIC_ATTEMPTS", "attempts")
KAFKA_TOPIC_LOGS = os.getenv("KAFKA_TOPIC_LOGS", "logs")
ALLOW_PROB = float(os.getenv("ALLOW_PROBABILITY", "0.5"))

consumer: Optional[KafkaConsumer] = None
producer: Optional[KafkaProducer] = None
consume_thread: Optional[threading.Thread] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_producer():
    global producer
    if producer:
        return producer
    endpoints = [e.strip() for e in KAFKA_BOOTSTRAP.split(",") if e.strip()]
    if not endpoints:
        log.error("No Kafka bootstrap configured")
        return None
    producer = KafkaProducer(
        bootstrap_servers=endpoints,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        linger_ms=10,
        retries=3,
    )
    return producer


def process_attempt(record: dict):
    badge_id = record.get("badgeID") or record.get("badgeId") or record.get("badge") or ""
    door_id = record.get("doorID") or record.get("doorId") or record.get("door") or ""
    device_id = record.get("deviceId") or record.get("device_id") or ""
    if not door_id:
        log.warning(f"[CORE] attempt sans doorID: {record}")
        return
    allowed = random.random() < ALLOW_PROB
    status = "GRANTED" if allowed else "DENIED"
    payload = {
        "badgeID": badge_id,
        "doorID": door_id,
        "deviceId": device_id,
        "status": status,
        "timestamp": now_iso(),
    }
    log.info(f"[CORE] attempt badge={badge_id} door={door_id} device={device_id} => {status}")
    prod = ensure_producer()
    if not prod:
        return
    prod.send(KAFKA_TOPIC_LOGS, value=payload)
    log.info(f"[CORE] {status} badge={badge_id} door={door_id} device={device_id} -> topic={KAFKA_TOPIC_LOGS}")


def start_consumer():
    global consumer, consume_thread
    endpoints = [e.strip() for e in KAFKA_BOOTSTRAP.split(",") if e.strip()]
    if not endpoints:
        log.error("No Kafka bootstrap configured, consumer not started")
        return
    consumer = KafkaConsumer(
        KAFKA_TOPIC_ATTEMPTS,
        bootstrap_servers=endpoints,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="latest",
        enable_auto_commit=True,
        group_id="core-operational",
    )

    def _loop():
        log.info(f"[CORE] Listening on {KAFKA_TOPIC_ATTEMPTS}")
        for msg in consumer:
            try:
                if msg.value:
                    process_attempt(msg.value)
            except Exception as e:
                log.warning(f"[CORE] consume error: {e}")

    consume_thread = threading.Thread(target=_loop, name="core-consumer", daemon=True)
    consume_thread.start()


app = FastAPI(title="Core Operational Backend")
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
        "kafka_bootstrap": KAFKA_BOOTSTRAP,
        "topic_attempts": KAFKA_TOPIC_ATTEMPTS,
        "topic_logs": KAFKA_TOPIC_LOGS,
        "allow_probability": ALLOW_PROB,
        "consumer_running": consume_thread is not None and consume_thread.is_alive(),
        "producer_ready": producer is not None,
    }


start_consumer()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "9020")))
