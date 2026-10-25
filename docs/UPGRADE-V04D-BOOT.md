# OpenRGD Console v0.4D — Boot Manager / Mini-PC Ubuntu

## Scopo

Aggiorniamo la Console v0.4C già funzionante sul mini-PC senza reimpostare Ubuntu, non tocchiamo i controller CAN/STM32, e **non cancelliamo** i volumi `console_data` e `module_data`. Aggiungiamo soltanto un servizio privato chiamato `boot-manager`, un volume `boot_data`, nuove rotte API e la schermata `/boot`.

**La versione v0.4C è già configurata per ripartire con Docker (`unless-stopped`); il nuovo servizio adotterà la stessa politica.** Questo non apre automaticamente il browser, né attiva il kiosk, e non cambia UEFI o BIOS.

## 1. Aggiornamento sorgenti (senza sudo)

```bash
mkdir -p ~/openrgd/artifacts/console-v04d
unzip -q ~/Downloads/openrgd-console-foundation-v0.4D.zip -d ~/openrgd/artifacts/console-v04d
bash ~/openrgd/artifacts/console-v04d/openrgd-console/scripts/upgrade-v04d.sh
```

Lo script effettua un backup prima di copiare il codice, esclude `config/`, `.env*`, `.git`, cartelle locali `data/` e non esegue comandi Docker. Un secondo aggiornamento sui file sorgente è consentito, ma conserva sempre backup distinti. La procedura non altera le immagini in esecuzione fino al successivo comando Compose.

## 2. Compilazione e avvio

```bash
cd ~/openrgd/repos/openrgd-console
sudo docker compose config --quiet
sudo docker compose up -d --build --no-deps boot-manager api web
sudo docker compose ps
```

Nella prima installazione v0.4D il Dockerfile del Boot Manager scarica e installa la toolchain canonica OpenRGD fissata al commit `afe1a831b950a4e6560f0285a0103fc4eaa343b7`. Le dipendenze Python richiedono la rete durante il build. Il nuovo container non espone porte dell'host; la Console continua ad essere pubblicata soltanto su `127.0.0.1:8088`.

Il Module Agent, Calibration e i volumi preesistenti non vengono ricompilati né eliminati dal comando sopra. L'API viene collegata anche alla rete Docker interna per raggiungere Boot Manager.

## 3. Controlli fondamentali

```bash
python3 scripts/doctor.py
python3 scripts/boot-smoke.py
curl -fsS http://127.0.0.1:8088/api/v1/boot/status | python3 -m json.tool
```

Un risultato iniziale `setup_required` è **corretto**: non abbiamo ancora selezionato un profilo RGD per il boot. L'API può risultare healthy anche quando la spec RGD è assente o non valida: il guasto del modello non deve bloccare il browser.

Se l'API restituisce temporaneamente 502/503 subito dopo la ricreazione dei container, controlla gli endpoint quando i servizi sono realmente disponibili. Se un container si riavvia di continuo:

```bash
sudo docker compose logs --no-color --tail=100 boot-manager api web gateway
```

## 4. Prova della schermata

Apri `http://127.0.0.1:8088/boot`.

- Senza un'istanza fisica importata: `SETUP REQUIRED`.
- Selezionando l'istanza **sintetica parziale** dal precedente onboarding: `RECOVERY MODE` perché manca il kernel canonico. Nessuna correzione automatica.
- Con un **profilo canonico completo** che supera `rgd check` e `rgd boot`: `PROFILE CHECK OK`, ma `ACTUATION: BLOCKED` rimane sempre vero.

Il report e la selezione vengono conservati in `boot_data` e riverificati al riavvio del container. Nessun profilo canonico è sovrascritto.

## 5. Anteprima fullscreen facoltativa

Con una sessione grafica Ubuntu già aperta: `bash scripts/boot-preview.sh`. Esci con `Alt+F4`. Non abilita autologin, non sostituisce GNOME né modifica il BIOS.

## 6. Test del riavvio e conservazione dei dati

Per verificare il service boot prima del reboot fisico:

```bash
sudo docker compose restart boot-manager
python3 scripts/boot-smoke.py
```

Poi, per un collaudo di boot completo del computer (quando sicuro per l'elettronica), si verifica che Docker si avvii da systemd e tutti e cinque i container tornino `Up`. Questa wave **non** modifica l'avvio grafico Wayland e non attiva autologin su Ubuntu.

## 7. Invarianti di sicurezza

Nessun montaggio `/dev`, SocketCAN, GPIO, Docker socket, accesso agli alimentatori o comandi motori. L'esecuzione `rgd boot` è puramente dichiarativa; non significa che il robot sia in posizione sicura. Non configurare né simulare un arresto d'emergenza basato sul browser.

Non usare `docker compose down -v`. Se hai bisogno di annullare l'aggiornamento, usa il backup del codice creato da `upgrade-v04d.sh`, mantenendo i volumi. Un rollback automatizzato non è implementato.
