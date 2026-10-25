# OpenRGD Console v0.4A — aggiornamento del mini-PC Ubuntu 22.04

La versione precedente **v0.3 è già avviata e funzionante** sul mini-PC. Questo aggiornamento modifica soltanto la Console e aggiunge un quarto servizio Docker (`module-agent`). Non spostare o toccare la repo BHL, i controller STM32, le configurazioni dei motori o i modelli RGD.

## Architettura

```text
Browser --(solo loopback 127.0.0.1:8088)--> Caddy gateway
                                               |--> Next.js frontend
                                               `--> Rust Console API
                                                         `--> Python Module Agent:8090 (Docker internal only)
                                                                |--> Registry pinned Git source
                                                                `--> module_data Docker volume
console_data Docker volume: existing robot models, host report, bindings (unchanged)
```

**Non ci sono endpoint per comandi motori, plugin frontend arbitrari, firmware, calibrazione attiva o accesso al device.** Non è stata montata `/dev`, `/sys`, né `/var/run/docker.sock` nel container Module Agent. Il container usa UID 10002 e nessuna capability Linux. I build Rust/Cargo possono tuttavia eseguire build script di terze parti: questo è un rischio di supply-chain, confinato al container per questa milestone, non un sandbox formalmente verificato.

## 1. Aggiorna i sorgenti senza perdere la configurazione

1. Scarica `openrgd-console-foundation-v0.4A.zip` nella cartella `~/Downloads` del mini-PC.
2. Esegui **senza sudo**:

```bash
mkdir -p ~/openrgd/artifacts/console-v04a
unzip -q ~/Downloads/openrgd-console-foundation-v0.4A.zip \
  -d ~/openrgd/artifacts/console-v04a
bash ~/openrgd/artifacts/console-v04a/openrgd-console/scripts/upgrade-v04a.sh
```

Lo script crea un archivio di backup sotto `~/openrgd/backups/` e copia i sorgenti. **Non cancella né sovrascrive** `config/`, `data/`, `.env` o i volumi Docker. Non usa `sudo` né avvia container.

Se avevi modificato manualmente file sorgenti Docker/React/Rust, il backup li conserverà. Non cancellarlo fino al collaudo.

## 2. Avvio Docker

```bash
cd ~/openrgd/repos/openrgd-console
sudo docker compose config --quiet
sudo docker compose up --build -d
sudo docker compose ps
```

Per il **primo build** dell'agente sono necessari Docker Hub, APT/GitHub e Rust crate registry; il catalogo sarà invece consultabile offline dopo il build. L'immagine è costruita usando l'istantanea **pinned** del Registry `OpenRGD/rgd-modules` commit `0268b3748042d04fd3561553616388368881e04a`.

Attenzione: non usare `sudo docker compose down -v` perché cancellerebbe i volumi (`console_data`, `module_data`). Gli aggiornamenti ordinari non richiedono lo spegnimento di Paky-01, perché la Console è non attuante.

## 3. Doctor / navigazione

```bash
python3 scripts/doctor.py
sudo docker compose logs --tail=80 module-agent
```

Apri `http://127.0.0.1:8088/modules`. Deve apparire `OpenRGD Calibration v0.2.0` con stato **Disponibile**, non installato. I moduli bundled della Console sono mostrati in un elenco separato.

Se `module-agent` non parte, le altre funzionalità della Console devono continuare a funzionare. Verifica `sudo docker compose logs --tail=150 module-agent api`.

## 4. Installazione esplicita di Calibration

Sulla pagina Modules scegli **Installa e compila** per `org.openrgd.calibration@0.2.0`. Leggi il rischio relativo alla compilazione Rust; il sistema richiede di digitare:

```text
INSTALL org.openrgd.calibration@0.2.0 build
```

Solo dopo la conferma viene avviato un job di installazione nel container separato. La UI mostra queued/running/succeeded/failed e ripristina lo stato installato dal Registry. **ready = software integro**, non calibrazione verificata del robot. Non viene eseguito alcun movimento o homing.

La v0.4A non offre ancora **Esegui inspect dalla Console**: il comando CLI `rgd-calibration inspect --bundle <directory>` necessita di un'adattabilità sicura del bundle RGD importato e di contratti di rapporto. Questo sarà il successivo step, non è un bottone fittizio.

## 5. Limiti reali e sicurezza

- `source_only` è una installazione sorgente NON pronta per l'esecuzione. L'installer non consente di sovrascriverla per trasformarla in una build: nessun falso pulsante di aggiornamento nella UI.
- L'installer non consente uninstall/update/rollback automatici; la manutenzione richiede procedure esplicite.
- Il Registry è `0.1.0-candidate` ed è pinzato a un commit, **non un marketplace di pacchetti firmati**.
- Né la Console né il Module Agent dispongono di autenticazione utente: mantieni l'intero sistema accessibile esclusivamente tramite loopback locale e tunnel SSH autenticato. Il controllo Origin/header e la conferma testuale **non sostituiscono l'autenticazione**.
- Il job di installazione è gestito in RAM: se il manager viene riavviato, il Job ID potrebbe non essere più disponibile; lo stato realmente installato viene sempre verificato tramite il volume persistente `module_data`.
- Cargo build scripts possono eseguire codice non fidato nel container con i permessi dell'utente interno e con accesso alla rete. **Non è un isolamento di sicurezza assoluto.**
- L'installazione non modifica i Canonical RGD profiles e non certifica misure fisiche.

## 6. Verifica manuale e regressioni

```bash
# Non attua e non installa moduli:
curl -fsS http://127.0.0.1:8088/healthz
curl -fsS http://127.0.0.1:8088/api/v1/modules/agent-health
curl -fsS http://127.0.0.1:8088/api/v1/modules/catalog
python3 scripts/doctor.py

# Controlla la persistenza senza cancellare i volumi:
sudo docker compose down
sudo docker compose up -d
python3 scripts/doctor.py
```

Il sistema resta non attuante. Il collaudo più importante è vedere che la Console ha ancora tutti i modelli/istanze importati in v0.3 dopo l'aggiornamento.
