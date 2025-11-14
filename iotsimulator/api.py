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


manager = DeviceManager()

app = FastAPI(title="IoT In-Memory Simulator")
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
