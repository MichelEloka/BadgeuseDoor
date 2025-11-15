#!/bin/sh
PWDFILE="/mosquitto/config/passwordfile"

if [ ! -f "$PWDFILE" ]; then
    echo " Création du fichier d'auth MQTT"

    if [ -z "$MQTT_USER" ] || [ -z "$MQTT_PASSWORD" ]; then
        echo " MQTT_USER ou MQTT_PASSWORD non défini"
        exit 1
    fi
    mosquitto_passwd -b -c "$PWDFILE" "$MQTT_USER" "$MQTT_PASSWORD"
    chmod 600 "$PWDFILE"
else
    echo " Password file déjà créé, on continue."
fi

echo " Lancement de Mosquitto..."
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf