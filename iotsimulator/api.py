import logging
import os
import json
import time
import urllib.request
from typing import Literal, Optional

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import MQTT_HOST, MQTT_PORT, load_plans, save_plans
from manager import DeviceManager


class CreateDevice(BaseModel):
    kind: Literal["badgeuse", "porte"]
    device_id: str
    door_id: Optional[str] = None


def _fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=5) as resp:
        if resp.status != 200:
            raise RuntimeError(f"http {resp.status}")
        return json.loads(resp.read().decode("utf-8"))


manager = DeviceManager()

app = FastAPI(title="IoT In-Memory Simulator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def bootstrap_workers_from_plans():
    orch_url = os.getenv("ORCH_URL", "http://entrance-cockpit-backend:9500/orchestrator")
    devices_url = os.getenv("ORCH_DEVICES_URL") or f"{orch_url}/devices"
    retry_delay = float(os.getenv("ORCH_BOOTSTRAP_DELAY", "2"))
    total_timeout = float(os.getenv("ORCH_BOOTSTRAP_TIMEOUT", "60"))  # secondes
    plan_ids_env = os.getenv("ORCH_PLAN_IDS", "etage-1")
    plan_ids = [pid.strip() for pid in plan_ids_env.split(",") if pid.strip()]
    list_retries = int(os.getenv("ORCH_PLAN_LIST_RETRIES", "3"))

    # 1) Tentative principale : /orchestrator/devices (avec door_id pour badgeuse)
    devices_bootstrapped = False
    deadline = time.time() + total_timeout
    attempt = 0
    while time.time() < deadline and not devices_bootstrapped:
        attempt += 1
        try:
            records = _fetch_json(devices_url)
            logging.info("[api] fetched devices from backend (%s) after %s attempt(s)", len(records), attempt)
            for rec in records:
                device_id = rec.get("id") or rec.get("deviceId") or ""
                kind = rec.get("kind") or rec.get("type")
                if not device_id or kind not in {"badgeuse", "porte"}:
                    continue
                door_id = rec.get("door_id") or rec.get("doorId") or rec.get("targetDoorId")
                manager.ensure(kind, device_id, door_id if kind == "badgeuse" else None)
                logging.info("[api] ensured from devices kind=%s id=%s door=%s", kind, device_id, door_id)
            devices_bootstrapped = True
        except Exception as e:
            logging.warning("[api] fetch devices attempt %s failed (%s)", attempt, e)
            time.sleep(retry_delay)

    if not devices_bootstrapped:
        logging.warning("[api] giving up on backend devices fetch, fallback to plans/local")
        # 2) Fallback : plans (/plans ou /plans/{id}) puis fichier local
        plans = []
        deadline = time.time() + total_timeout
        attempt = 0
        while time.time() < deadline and not plans and attempt < list_retries:
            attempt += 1
            try:
                plans = _fetch_json(f"{orch_url}/plans")
                logging.info("[api] fetched plans from orchestrator (%s) after %s attempt(s)", len(plans), attempt)
                break
            except Exception as e:
                logging.warning("[api] fetch plans list attempt %s failed (%s)", attempt, e)
                time.sleep(retry_delay)
        if not plans and plan_ids:
            for pid in plan_ids:
                if time.time() >= deadline:
                    break
                try:
                    plan = _fetch_json(f"{orch_url}/plans/{pid}")
                    if plan:
                        plans.append(plan)
                        logging.info("[api] fetched plan %s from orchestrator", pid)
                        break
                except Exception as e:
                    logging.warning("[api] fetch plan %s failed (%s)", pid, e)
                    time.sleep(retry_delay)
        if not plans:
            logging.warning("[api] unable to fetch plans from orchestrator within timeout, fallback to local file")
            plans = load_plans()

        for plan in plans:
            nodes = plan.get("nodes") or []
            for node in nodes:
                device_id = node.get("deviceId") or ""
                kind = node.get("kind")
                if not device_id or kind not in {"badgeuse", "porte"}:
                    continue
                door_id = node.get("targetDoorId") if kind == "badgeuse" else None
                manager.ensure(kind, device_id, door_id)
                logging.info("[api] ensured from plan kind=%s id=%s door=%s", kind, device_id, door_id)

    # Bootstrap depuis le registre de devices (si des devices existent en DB)
    deadline = time.time() + total_timeout
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            records = _fetch_json(devices_url)
            logging.info("[api] fetched devices from backend (%s) after %s attempt(s)", len(records), attempt)
            for rec in records:
                device_id = rec.get("id") or rec.get("deviceId") or ""
                kind = rec.get("kind") or rec.get("type")
                if not device_id or kind not in {"badgeuse", "porte"}:
                    continue
                door_id = rec.get("door_id") or rec.get("doorId") or rec.get("targetDoorId")
                manager.ensure(kind, device_id, door_id if kind == "badgeuse" else None)
                logging.info("[api] ensured from devices kind=%s id=%s door=%s", kind, device_id, door_id)
            break
        except Exception as e:
            logging.warning("[api] fetch devices attempt %s failed (%s)", attempt, e)
            time.sleep(retry_delay)
    else:
        logging.warning("[api] giving up on backend devices fetch after timeout")

    logging.info("[api] bootstrap workers completed")


@app.get("/health")
def health():
    return {
        "ok": True,
        "mqtt": {"host": MQTT_HOST, "port": MQTT_PORT},
        "devices": len(manager.list(None)),
    }


@app.get("/plans")
def get_plans():
    return load_plans()


@app.get("/plans/{floor_id}")
def get_plan(floor_id: str):
    for plan in load_plans():
        if plan.get("id") == floor_id:
            return plan
    raise HTTPException(status_code=404, detail="Plan not found")


@app.post("/plans/{floor_id}")
def save_plan_endpoint(floor_id: str, plan: dict = Body(...)):
    plans = load_plans()
    for idx, existing in enumerate(plans):
        if existing.get("id") == floor_id:
            plans[idx] = plan
            break
    else:
        plans.append(plan)
    save_plans(plans)
    return {"ok": True}


@app.post("/devices")
def create_device(req: CreateDevice):
    logging.info("[api] create_device kind=%s id=%s door=%s", req.kind, req.device_id, req.door_id)
    record = manager.ensure(req.kind, req.device_id, req.door_id)
    ready = record.worker.wait_ready(timeout=8.0)
    payload = {
        "ok": True,
        "device": {
            "id": req.device_id,
            "kind": record.kind,
            "status": "running" if ready else "starting",
            "ready": ready,
        },
    }
    if record.kind == "badgeuse":
        payload["device"]["door_id"] = record.door_id
    return payload


@app.get("/devices")
def list_devices(kind: Optional[str] = Query(default=None)):
    return manager.list(kind)


@app.delete("/devices/{device_id}")
def delete_device(device_id: str, remove_image: bool = Query(default=False)):
    logging.info("[api] delete_device id=%s remove_image=%s", device_id, remove_image)
    if not manager.remove(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    return {"ok": True}


@app.get("/devices/{device_id}/health")
def device_health(device_id: str):
    record = manager.get(device_id)
    if not record:
        raise HTTPException(status_code=404, detail="Device inconnu")
    return record.worker.health()


@app.post("/door/{device_id}/{action}")
def proxy_door(device_id: str, action: str):
    record = manager.get(device_id)
    if not record or record.kind != "porte":
        raise HTTPException(status_code=404, detail="Porte inconnue")
    if action not in {"open", "close", "toggle"}:
        raise HTTPException(status_code=400, detail="Action invalide")
    worker = record.worker
    worker.apply_action(action)
    return {"status": 200, "data": worker.health()}
