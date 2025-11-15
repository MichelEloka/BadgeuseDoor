#!/bin/sh
set -e

PWDFILE="/mosquitto/config/passwordfile"

echo " Initialisation du fichier de mots de passe..."

# Si le fichier existe déjà, on le supprime
if [ -f "$PWDFILE" ]; then
    echo " Fichier de password existant trouvé, suppression : $PWDFILE"
    rm -f "$PWDFILE"
fi

# Vérifier que les variables d'env sont là
if [ -z "$MQTT_USER" ] || [ -z "$MQTT_PASSWORD" ]; then
    echo " MQTT_USER ou MQTT_PASSWORD non défini (variables d'environnement)"
    exit 1
fi

# Créer un nouveau fichier de password
echo " Création d'un nouveau fichier de password pour l'utilisateur '$MQTT_USER'"
mosquitto_passwd -b -c "$PWDFILE" "$MQTT_USER" "$MQTT_PASSWORD"
chmod 600 "$PWDFILE"

echo " Lancement de Mosquitto..."
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
