import json
import logging
import os
import pathlib
from datetime import datetime, timezone
from typing import Any, List

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("simulator")

MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
DATA_DIR = pathlib.Path(os.getenv("SIMULATOR_DATA_DIR", "./simulator_data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
PLANS_FILE = DATA_DIR / "plans.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_plans() -> List[Any]:
    if PLANS_FILE.exists():
        try:
            return json.loads(PLANS_FILE.read_text(encoding="utf-8"))
        except Exception:
            log.exception("Impossible de lire %s", PLANS_FILE)
    return []


def save_plans(plans: List[Any]) -> None:
    PLANS_FILE.write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding="utf-8")
