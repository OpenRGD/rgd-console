# HANDOFF — OpenRGD Voice Studio → Console / Module Agent

**Aggiornato: 27 ottobre 2026.** Destinatario: team/chat `OpenRGD Console`.  
**Tipo:** handoff tecnico e decisioni architetturali. Non introduce runtime, nuove autorizzazioni o installazioni.

## 1. Decisione e perimetro

OpenRGD Voice Studio è un servizio audio locale indipendente. Ha raggiunto una baseline funzionale e verificata su Paky-01 per registrazione, VAD, trascrizione Whisper, voce predefinita Piper Serena High, riproduzione su Bose A2DP, eventi Visual Feedback e metriche di consumo. **Non implementa alcuna cognizione**; RGD identity, Chronon, decisioni e conoscenza appartengono a un progetto/repository cognitivo futuro.

**Non rifare i provider, il VAD o la dashboard in Console.** Console deve occuparsi di installazione approvata, discovery, stato e configurazione tramite contratti, senza possedere BLE o hardware audio.

## 2. Baseline GitHub verificate (27/10)

| Repository | Main / fonte | Stato |
|---|---|---|
| `OpenRGD/rgd-voice` | `22fe6384f6fd24ad46b8135de38d5f002611efef` | PR #1 (FFmpeg CI), #2 (0.4D Visual Lifecycle/VAD), #5 (0.5A Piper residente) **merged**; CI main verde Python 3.10/3.12 |
| `OpenRGD/rgd-visual-feedback` | `b805113fbd7be1acac795afb4f087905825cd252` | PR #2 (voice_event IPC v0.3) **merged**; CI main verde |
| `OpenRGD/rgd-console` | `3395b66f1eae8013b6ffd9cf15866394cbc70c29` | Main originale, **invariato**, Next.js + Rust/Axum + Module Agent; PR #3 solo documentale Draft |
| `OpenRGD/rgd-modules` | index candidate v0.1 | Solo `org.openrgd.calibration`; `org.openrgd.voice` **NON registrato** |
| `OpenRGD/rgd-reality-ingress` | repository separata | Nessuna ownership del microfono delegata da Voice |

Riferimenti: https://github.com/OpenRGD/rgd-voice/pull/2 ; https://github.com/OpenRGD/rgd-voice/pull/5 ; https://github.com/OpenRGD/rgd-visual-feedback/pull/2 ; https://github.com/OpenRGD/rgd-console/pull/3 .

**PR ancora separate:** Voice #4 browser HTML audio playback (Draft, base ora main; da collaudare realmente); Voice #3 ADR audio/PERIPH (Draft); Visual #3 Visual Effects Studio (Draft/altro studio). Non confondere quelle PR con la baseline merged.

## 3. Prove sul mini-PC (26 ottobre, operator-confirmed)

`phate6872@minipc`, Ubuntu 22.04 e PulseAudio:

- Microfono `BC-Master 1610USB`: `alsa_input.usb-BC_Master_1610USB_BC_Master_1610USB_BC_Master_1610USB-00.mono-fallback`; VAD WebRTC v0.1D locale.
- Output `Bose` Bluetooth **A2DP**: `bluez_sink.60_AB_D2_0D_E2_01.a2dp_sink`. Non commutare automaticamente su Bluetooth HFP; qualità e stabilità inferiori già osservate.
- STT `faster-whisper base` (CPU int8), TTS predefinita `piper:it_IT-serena-high`, archiviata nel profilo locale `~/.local/share/openrgd/voice-lab/profiles/paky-01-voice-output.json`.
- ECHO reale **3/3 turni** con Piper residente: prewarm ONNX una volta = **1,401s**; STT **1,14 / 1,23 / 4,14s**, TTS **1,65 / 2,73 / 2,31s**, playback Bose **2,59 / 4,24 / 2,92s**.
- Benchmark identico (5 sintesi): mediana dei turni 2–5 **4,595s residente** vs **6,772s senza cache** (−**32,1%**, 2,177s in meno). È **full WAV before playback**, non streaming. Il guadagno misurato include variazioni di carico CPU; non tutto è caricamento ONNX.
- Test locali **83/83** su Voice 0.5A; Actions su main (post merge) verdi.
- Visual Feedback fisicamente osservato dall'operatore come funzionante. IPC `voice_event`, server BLE `connected=true`, `desired=idle` e `applied=idle` osservati; `physical_event_verified=false` rimane corretto (nessun sensore ottico).
- Warning ONNX device-discovery GPU benigno per il percorso CPU; nessun motivo di cambiare kernel Ubuntu/BHL.

L'operatore aveva anche due Console (8088 principale, 8099 preview 3D) HTTP 200 nel test del 26/10: **questo è uno stato storico**, non autorizza modifiche al Docker o conclusioni sulla disponibilità attuale.

## 4. Interfacce effettive e garanzie

- Voice Lab GUI/API: `http://127.0.0.1:8765` (SOLO loopback, senza autenticazione adatta a Internet/LAN). Nessun Caddy reverse proxy automatico; nessuna esposizione alla rete prima di authn/authz e CSRF review.
- Preset Voice locale e credenziali cloud: `~/.config/openrgd/voice-lab/.env` (0600), fuori da repository, log, Console e Docker Module Agent. Cloud TTS esplicitamente autorizzato; preferenza attuale Piper (offline).
- `RGD_VOICE_PIPER_RESIDENT=1` mantiene un singolo ONNX Piper in memoria per processo; rollback `=0`. Cambiare modello evict; no condivisione tra processi.
- `RGD_VOICE_VISUAL_FEEDBACK=1` abilita eventi Voice non bloccanti; default OFF. Il relay usa il socket Visual già esistente `$XDG_RUNTIME_DIR/paky01-visual-feedback.sock`, non apre BLE autonomamente.
- Contract Visual IPC candidate `openrgd.visual.voice-event.v0.1-candidate`: source `rgd-voice`, producer session UUID32, sequence monotono. Eventi `listening.started`, `inference.started`, `playback.started`, `playback.ended`, `voice.error`, `voice.ready`.
- Evidenza di `listening`: primo PCM non vuoto del VAD, non la presenza del dispositivo. `thinking`: effettiva trascrizione STT, non dichiarazione di cognizione. `speaking`: player avviato, **non** semplice TTS pronto. `applied` LED = BLE write, non conferma ottica. Fallimento BLE non interrompe Voice.
- È ancora half-duplex/ECHO, NON sistema cognitivo, NON full duplex, NON barge-in. Native HTML browser `<audio>` Visual events sono PR Voice #4 **non merged**.

## 5. Boundary Console/Peripheral Manager (CRITICO)

Console Module Agent presente oggi è un servizio Docker privato, privo di accesso ai dispositivi host. `rgd-modules` accetta distribuzioni `pinned_git_cargo`, mentre Voice è un pacchetto/servizio Python e non è ancora un `org.openrgd.voice` installabile. `module.candidate.json` nella repo Voice è una dichiarazione **non normativa**, non un manifest accettato dal registry.

**Non** esporre `/dev/snd`, socket PulseAudio, D-Bus, socket Docker, BLE o segreti API al Module Agent come scorciatoia. Per un modulo residente servono:
1. Estensione versionata e sottoposta a review del registry/installer per Python: SHA/digests, dependency pinning, compatibilità host, esplicita approvazione install/start, permessi minimali e rollback.
2. Voice Host Agent **systemd --user**, non root, nel contesto della sessione audio Paky-01. IPC locale con autenticazione dell'operatore, UID/peer controls, schema e rate limits. L'API Console non deve eseguire comandi shell arbitrari.
3. Console mostra discovery, stato **`candidate / not_installed / source_only / ready`** solo secondo il registry reale e health reale dell'host. Evitare il falso `installed` perché Voice Lab attualmente si avvia a mano.
4. Registrare e installare `org.openrgd.voice` solo dopo manifest, source pin, test e commissioning fisico.

**PERIPH-0.1/0.2:** PR Console #5/#6 ancora Draft; gestione fisica sviluppata per IMU USB seriale, **non** autorizza ancora microfoni o Bluetooth. Aspettiamo handoff PERIPH prima di modificare la pagina Dispositivi/identity/ownership. Nel frattempo Voice usa PulseAudio diretto in modalità laboratorio dichiarata LOCAL/UNMANAGED. Futura acquisizione PCM con un solo owner e fanout autorizzato a Voice/Reality Ingress; nessuna registrazione ambientale persistente di default.

Console Boot Manager `ready_non_actuating`, Somatic Runtime e controllo CAN/motori completamente fuori scopo. Non modificare volumi Docker o deploy locale da questa PR.

## 6. Prossime Wave e dipendenze

**Voice (questa chat/repository):**
- Consolidamento 0.4D e 0.5A **completato su GitHub**.
- Prossima PR autonoma: **VOICE-0.5A.1 Progressive TTS / Time to first audio**. Piper residente emette blocchi audio, player riproduce progressivamente, metriche latenza al primo campione, rollback su percorso full WAV, pieno supporto Bose A2DP. Non confondere con full-duplex; nessuna modifica al provider cognitivo o PERIPH.
- **VOICE-0.5B AEC/duplex** solo dopo contratto audio PERIPH, con benchmark echo speaker→mic, separazione voce propria, barge-in cancellabile e priorità playback.
- Valutazione speaker USB interno (Geekworm YB-MVEO3/Pimoroni) separata; Bose Bluetooth A2DP resta uscita ufficialmente supportata. Nessuno speaker nuovo installato.

**Console (altra chat/repository):**
- Aggiornare sua PR #3 docs con questo handoff (documento corrente), mantenerla Draft finché i contratti Console/Voice Registry sono ancora proposte.
- Non aggiungere un secondo Voice Studio dentro Next.js né duplicate provider SDK. Prima decidere lifecycle approvato, status/health read-only e responsabile del servizio host.
- Futuro branch dedicato da **main Console più recente** dopo aver confrontato overlay locali con GitHub: integrazione `org.openrgd.voice` candidate read-only, poi installazione, poi configurazione operatore; nessun push diretto main.
- Visual Feedback Studio appartiene alla repo `rgd-visual-feedback`. Console ne può mostrare sintesi/stato in sola lettura, non diventare il proprietario di BLE.
- Stato di Console CI generica non presumere verde; valutare i workflow target e la realtà del mini-PC.

## 7. Fonti canoniche per ripresa

- Voice merged: https://github.com/OpenRGD/rgd-voice
- Visual merged: https://github.com/OpenRGD/rgd-visual-feedback
- Console: https://github.com/OpenRGD/rgd-console
- Registry: https://github.com/OpenRGD/rgd-modules
- Voice lifecycle/real VAD: https://github.com/OpenRGD/rgd-voice/pull/2
- Resident Piper benchmark: https://github.com/OpenRGD/rgd-voice/pull/5
- Browser playback non merged: https://github.com/OpenRGD/rgd-voice/pull/4
- Peripheral drafts: https://github.com/OpenRGD/rgd-console/pull/5 and https://github.com/OpenRGD/rgd-console/pull/6

**Decisione richiesta alla chat Console:** progettare il contratto di packaging Python e l'integrazione host audio **senza distribuire ancora né duplicare Voice**, rispettando l'handoff PERIPH e gli invarianti di sicurezza; proporre una PR autonoma con check di compatibilità e rollback, non modifiche dirette al runtime.
