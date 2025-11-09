import os, logging, time
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import docker, requests
import json, pathlib

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("orchestrator")

# --- Config broker/images ---
MQTT_HOST      = os.getenv("MQTT_HOST", "host.docker.internal")
MQTT_PORT      = int(os.getenv("MQTT_PORT", "1883"))
IMAGE_BADGEUSE = os.getenv("IMAGE_BADGEUSE", "iot-badgeuse:latest")
IMAGE_PORTE    = os.getenv("IMAGE_PORTE", "iot-porte:latest")
DOCKER_NETWORK = os.getenv("DOCKER_NETWORK")  # ex: "badgeusedoor_iot"

# --- Docker client ---
client = docker.from_env()
client.ping()

app = FastAPI(title="IoT Orchestrator v3")

PLANS_FILE = pathlib.Path("/data/plans.json")
PLANS_FILE.parent.mkdir(parents=True, exist_ok=True)

def _load_plans():
    if PLANS_FILE.exists():
        return json.loads(PLANS_FILE.read_text(encoding="utf-8"))
    return []

def _save_plans(plans):
    PLANS_FILE.write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding="utf-8")


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restreins en prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateDevice(BaseModel):
    kind: Literal["badgeuse", "porte"]
    device_id: str

# ----------------- helpers -----------------
def _internal_port(kind: str) -> int:
    return 8000 if kind == "badgeuse" else 8001

def _image_for(kind: str) -> str:
    return IMAGE_BADGEUSE if kind == "badgeuse" else IMAGE_PORTE

def _service_url_for(device_id: str, kind: str) -> str:
    """URL interne via le réseau Docker (pas de localhost)."""
    return f"http://{device_id}:{_internal_port(kind)}"

def _wait_ready(url: str, timeout_s: float = 10.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            r = requests.get(f"{url}/health", timeout=1.5)
            if r.ok:
                return True
        except Exception:
            pass
        time.sleep(0.4)
    return False

def _ensure_running(kind: str, device_id: str):
    """Start container if missing/stopped. Return (container, internal_url)."""
    try:
        c = client.containers.get(device_id)
        if c.status != "running":
            c.start()
        c.reload()
    except docker.errors.NotFound:
        kwargs = {
            "image": _image_for(kind),
            "name": device_id,
            "environment": {
                "DEVICE_ID": device_id,
                "MQTT_HOST": MQTT_HOST,
                "MQTT_PORT": str(MQTT_PORT),
                "MQTT_USER": os.getenv("MQTT_USER", ""),
                "MQTT_PASS": os.getenv("MQTT_PASS", ""),
            },
            "detach": True,
            "labels": {"iot": "true", "iot.kind": kind, "iot.device_id": device_id},
            "restart_policy": {"Name": "unless-stopped"},
        }
        # ⚠️ on N'EXPOSE PAS de port ici: l'orchestrateur parle en interne
        if DOCKER_NETWORK:
            kwargs["network"] = DOCKER_NETWORK
        c = client.containers.run(**kwargs)
        c.reload()
    k = c.labels.get("iot.kind", kind)
    return c, _service_url_for(device_id, k)

def _service_url_by_id(device_id: str) -> str:
    c = client.containers.get(device_id)
    k = c.labels.get("iot.kind")
    return _service_url_for(device_id, k)

# ----------------- routes -----------------
@app.get("/health")
def health():
    try:
        client.ping()
        return {"ok": True, "docker": "up", "mqtt": {"host": MQTT_HOST, "port": MQTT_PORT}, "network": DOCKER_NETWORK}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    
@app.get("/plans")
def get_plans():
    return _load_plans()

@app.get("/plans/{floor_id}")
def get_plan(floor_id: str):
    plans = _load_plans()
    for p in plans:
        if p.get("id") == floor_id:
            return p
    raise HTTPException(status_code=404, detail="Plan not found")

@app.post("/plans/{floor_id}")
def save_plan(floor_id: str, plan: dict = Body(...)):
    plans = _load_plans()
    found = False
    for i, p in enumerate(plans):
        if p.get("id") == floor_id:
            plans[i] = plan
            found = True
            break
    if not found:
        plans.append(plan)
    _save_plans(plans)
    return {"ok": True}

@app.post("/devices")
def create_device(req: CreateDevice):
    try:
        log.info(f"[orchestrator] ensure device kind={req.kind} id={req.device_id}")
        try:
            c = client.containers.get(req.device_id)
            c.reload()
            kind = c.labels.get("iot.kind", req.kind)
        except docker.errors.NotFound:
            c, _ = _ensure_running(req.kind, req.device_id)
            kind = req.kind
        url = _service_url_for(req.device_id, kind)
        ready = _wait_ready(url, 12.0)
        log.info(f"[orchestrator] device={req.device_id} kind={kind} status={c.status} ready={ready} url={url}")
        return {"ok": True, "device": {"id": req.device_id, "kind": kind, "status": c.status, "ready": ready}}
    except docker.errors.ImageNotFound:
        raise HTTPException(status_code=404, detail=f"Image not found. Build {_image_for(req.kind)} first.")
    except Exception as e:
        log.exception("create_device failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/devices")
def list_devices(kind: Optional[str] = None):
    filters = {"label": ["iot=true"]}
    if kind in ("badgeuse", "porte"):
        filters["label"].append(f"iot.kind={kind}")
    out = []
    for c in client.containers.list(all=True, filters=filters):
        c.reload()
        id_ = c.labels.get("iot.device_id", c.name)
        k = c.labels.get("iot.kind", "unknown")
        url = _service_url_for(id_, k)
        ready = _wait_ready(url, 0.01)  # ping non-bloquant
        out.append({"id": id_, "kind": k, "status": c.status, "ready": ready})
    return out

@app.delete("/devices/{device_id}")
def delete_device(device_id: str):
    try:
        c = client.containers.get(device_id)
        c.remove(force=True)
        return {"ok": True}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Device not found")

# -------- Proxies d'actions (internal URL + readiness) --------
@app.post("/badge/{device_id}")
def proxy_badge(device_id: str, body: dict):
    try:
        url = _service_url_by_id(device_id)  # ex: http://badgeuse-007:8000
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Badgeuse inconnue")
    if not _wait_ready(url, 6.0):
        raise HTTPException(status_code=503, detail="Badgeuse non prête")
    try:
        r = requests.post(f"{url}/badge", json=body, timeout=5)
        data = r.json() if r.content else {}
        return {"status": r.status_code, "data": data}
    except Exception as e:
        log.exception("proxy_badge failed")
        raise HTTPException(status_code=502, detail=str(e))

@app.post("/door/{device_id}/{action}")
def proxy_door(device_id: str, action: str):
    if action not in {"open", "close", "toggle"}:
        raise HTTPException(status_code=400, detail="Action invalide")
    try:
        url = _service_url_by_id(device_id)  # ex: http://porte-002:8001
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Porte inconnue")
    if not _wait_ready(url, 6.0):
        raise HTTPException(status_code=503, detail="Porte non prête")
    try:
        r = requests.post(f"{url}/{action}", timeout=5)
        data = r.json() if r.content else {}
        return {"status": r.status_code, "data": data}
    except Exception as e:
        log.exception("proxy_door failed")
        raise HTTPException(status_code=502, detail=str(e))
