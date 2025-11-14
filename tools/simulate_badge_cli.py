import argparse
import json
import logging
import os
import sys
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt


log = logging.getLogger("badge-cli")
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Simule un badgeage en publiant une commande MQTT sur une badgeuse."
    )
    parser.add_argument(
        "badgeuse_id",
        help="Identifiant de la badgeuse cible (ex: badgeuse-001).",
    )
    parser.add_argument(
        "badge_id",
        help="Identifiant du badge à envoyer (ex: BADGE-1234).",
    )
    parser.add_argument(
        "--host",
        default=os.getenv("MQTT_HOST", "localhost"),
        help="Hôte du broker MQTT (défaut: %(default)s ou MQTT_HOST).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("MQTT_PORT", "1883")),
        help="Port du broker MQTT (défaut: %(default)s ou MQTT_PORT).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Timeout (secondes) pour la connexion et la publication (défaut: %(default)s).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    badgeuse_id = args.badgeuse_id.strip()
    badge_id = args.badge_id.strip()

    if not badgeuse_id:
        log.error("badgeuse_id vide")
        return 1
    if not badge_id:
        log.error("badge_id vide")
        return 1

    connected = threading.Event()
    connect_error: dict[str, str | None] = {"msg": None}
    client = mqtt.Client(
        client_id=f"badge-cli-{badgeuse_id}",
        protocol=mqtt.MQTTv311,
    )

    mqtt_host = args.host
    mqtt_port = args.port
    mqtt_user = os.getenv("MQTT_USER", "")
    mqtt_pass = os.getenv("MQTT_PASS", "")

    if mqtt_user:
        client.username_pw_set(mqtt_user, mqtt_pass)

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            connected.set()
            log.info("Connecté à %s:%s", mqtt_host, mqtt_port)
        else:
            connect_error["msg"] = f"Connexion MQTT échouée (code={reason_code})"
            connected.set()

    client.on_connect = on_connect

    log.info("Connexion au broker MQTT %s:%s ...", mqtt_host, mqtt_port)
    client.connect(mqtt_host, mqtt_port, keepalive=30)
    client.loop_start()

    if not connected.wait(timeout=args.timeout):
        log.error("Timeout connexion MQTT (>%ss)", args.timeout)
        client.loop_stop()
        return 1

    if connect_error["msg"]:
        log.error(connect_error["msg"])
        client.loop_stop()
        return 1

    topic = f"iot/badgeuse/{badgeuse_id}/commands"
    payload: dict[str, str] = {
        "action": "simulate_badge",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "badgeID": badge_id,
    }

    log.info("Publication sur %s : %s", topic, payload)
    info = client.publish(topic, json.dumps(payload), qos=1, retain=False)
    if not info.wait_for_publish(timeout=args.timeout):
        log.error("Timeout publication MQTT (>%ss)", args.timeout)
        client.loop_stop()
        return 1

    log.info("Commande badge envoyée avec succès.")
    client.loop_stop()
    client.disconnect()
    return 0


if __name__ == "__main__":
    sys.exit(main())
