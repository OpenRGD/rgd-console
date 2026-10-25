# OpenRGD Console v0.3 — collaudo Ubuntu 22.04 e Fedora

Questa guida copre **solo** l'installazione locale della Console, importazione RGD, diagnostica passiva del computer e bozze di mapping. Nessun comando motorio, nessun controller interrogato. Il robot può restare spento.

## 1. Prerequisiti

- Ubuntu 22.04 o Fedora su x86_64/aarch64; un account normale con Python 3.
- Docker Engine + **Docker Compose v2 plugin** già installati (seguire la documentazione ufficiale Docker per la propria distribuzione).
- Connessione Internet per il primo build e il download delle dipendenze. Nessuna dipendenza da Internet a regime.
- Porta TCP **8088** libera su `127.0.0.1`. Accesso remoto solo via tunnel SSH autenticato.

Se `docker` non è disponibile al tuo utente o `docker compose version` non funziona, configura Docker prima di avviare il progetto. **Non aggiungere utenti al gruppo docker senza considerare che ciò concede privilegi equivalenti a root.**

## 2. Estrai e controlla (senza modificare il sistema)

```bash
unzip openrgd-console-foundation-v0.3.zip
cd openrgd-console
python3 scripts/preflight.py
```

Lo script stampa `OK`, `WARNING` o `BLOCKER`, ma non esegue installazioni, non usa sudo e non apre alcun dispositivo. Interrompiti se ci sono `BLOCKER`.

## 3. Primo avvio

```bash
docker compose up --build -d
docker compose ps
python3 scripts/doctor.py
```

Se fallisce:

```bash
docker compose logs --tail=120 api web gateway
```

Se il problema è una dipendenza o un lockfile, salva l'errore esatto prima di modificare i Dockerfile. Questa è ancora una distribuzione sorgente **non verificata su Ubuntu/Fedora**, non una release binaria.

## 4. Onboarding model-first

Apri `http://127.0.0.1:8088/onboarding` sul computer di installazione. Carica `examples/synthetic-foundation-partial.zip` e crea un'istanza di **test**. La Console dovrebbe indicare `partial_foundation`, `canonical_not_verified` e `actuation_enabled=false`. In Body puoi vedere la topologia dichiarata, non una posa reale.

## 5. Snapshot passivo dell'host

Dal terminale **dello stesso host** (non dal container):

```bash
python3 scripts/host-snapshot.py --output openrgd-host-report.json
```

In **Onboarding → Host inventory**, carica `openrgd-host-report.json`. Eventuali `can0`, `/dev/ttyACM0`, `/dev/ttyUSB0`, `/dev/video0` sono soltanto **nomi di endpoint osservati**. Non sono proof-of-identity dei controller. L'assenza di un endpoint nella lista non dimostra che un dispositivo sia assente o difettoso.

Potrai selezionare un endpoint come suggerimento nella fase Mapping, che resta sempre una **bozza non verificata**.

## 6. Accesso dal notebook al mini-PC

Non cambiare `127.0.0.1:8088` in `0.0.0.0`. Dal notebook:

```bash
ssh -L 8088:127.0.0.1:8088 utente-ubuntu@indirizzo-mini-pc
```

Poi apri `http://127.0.0.1:8088/onboarding` **sul notebook**. Se il notebook ospita già la propria Console sulla porta 8088, usa un'altra porta locale per il tunnel, per esempio `ssh -L 18088:127.0.0.1:8088 ...` e apri `http://127.0.0.1:18088`.

## 7. Backup e spegnimento

Il volume `console_data` contiene `workspace.json`, report e archivi importati. `docker compose down` **non cancella** il volume; `docker compose down -v` **lo cancella**.

Prima di aggiornare una versione usata realmente, crea una copia del volume e verifica il recupero. Non ci sono ancora migration tool/rollback automatici. Aggiornamenti automatici e installazione moduli da browser restano esclusi da v0.3.

## 8. Checklist di accettazione

- [ ] Preflight senza blocker
- [ ] `docker compose ps`: API/Web/Gateway avviati
- [ ] `python3 scripts/doctor.py`: PASS
- [ ] Caricamento ZIP sintetico riuscito
- [ ] Istanza registrata; valori fisici indisponibili
- [ ] Report host importato e indicato **unverified**
- [ ] Mapping salvato solamente come bozza
- [ ] Readiness riporta `actuation_enabled: false`
- [ ] Dati conservati dopo `docker compose down` / `up -d`
- [ ] Nessun comando motorio inviato o interfaccia hardware aperta dalla Console

**Obiettivo dell'esperimento:** validare lo stack indipendente dal robot, non collaudare Paky-01 o SO-101.
