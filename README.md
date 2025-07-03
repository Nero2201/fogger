# Fogger Installation auf dem Raspberry Pi mit FullPageOS

## Voraussetzungen

- Raspberry Pi (empfohlen: Pi 3 oder neuer)
- microSD-Karte (mind. 8 GB)
- Raspberry Pi Imager
- WLAN-Zugangsdaten

## 1. FullPageOS flashen

1. Lade den **Raspberry Pi Imager** von [https://www.raspberrypi.com/software/](https://www.raspberrypi.com/software/).
2. Wähle als Betriebssystem **FullPageOS** (z. B. FullPageOS – Chromium).
3. Klicke auf das Zahnrad-Symbol unten rechts, um erweiterte Einstellungen zu öffnen.
4. Trage hier ein:
   - Hostname des Pi
   - Benutzername und Passwort
   - WLAN-Name (SSID) und Passwort
5. Schreibe das Image auf die SD-Karte und stecke sie in den Raspberry Pi.
6. Nach dem Hochfahren sollte sich der Pi automatisch mit dem WLAN verbinden.

## 2. Verbindung per SSH

Verbinde dich per SSH mit dem Raspberry Pi:

```bash
ssh pi@<hostname>
```

(Standardnutzername ist `pi`, Passwort wie vorher festgelegt)

## 3. Repository klonen

Wechsle ins Home-Verzeichnis (falls nicht bereits dort) und klone das Projekt:

```bash
cd ~
git clone https://github.com/Nero2201/fogger/
```

## 4. Startseite von FullPageOS konfigurieren

Bearbeite die Startseite:

```bash
sudo nano /boot/fullpageos.txt
```

Ändere folgende Zeile:

```
http://127.0.0.1:1337/server
```

Speichern mit `Ctrl + O`, dann `Enter`, beenden mit `Ctrl + X`.

## 5. systemd-Service erstellen

Erstelle die Service-Datei:

```bash
sudo nano /etc/systemd/system/fogger.service
```

Inhalt:

```ini
[Unit]
Description=Fogger Server
After=network.target

[Service]
ExecStart=/usr/bin/python3 /home/pi/fogger/server.py
WorkingDirectory=/home/pi/fogger
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

Speichern und schließen.

## 6. Service aktivieren und starten

```bash
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable fogger.service
sudo systemctl start fogger.service
```

## 7. Status und Logs prüfen

Status prüfen:

```bash
sudo systemctl status fogger.service
```

Live-Log anzeigen:

```bash
journalctl -u fogger.service -f
```

---

Nach einem Neustart wird der Raspberry Pi automatisch die lokale Weboberfläche von Fogger im Vollbild anzeigen.
