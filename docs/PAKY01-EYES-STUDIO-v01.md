# Console — addon Paky-01 Occhi v0.1 (solo preview)

**Branch stacked** sulla Console PR #13 (Catalog Manager), a sua volta dipendente dalle PR #9 → #8 → #7. La pagina `/visual-effects` non è ancora in `main` finché quelle PR sono draft.

## Cosa è stato aggiunto
- Repertorio **Occhi v0.1** integrato nel Visual Effects Studio, senza creare una seconda console.
- Pulsante operatore **Carica repertorio v0.1** disponibile su Paky-01 con conferma esplicita: importa 21 ricette, 21 scene e 27 associazioni; non applica nulla all'hardware.
- Catalogo rapido delle scene con selezione e preview immediata nel simulatore ring + due LCD virtuali; modifica tramite Eye Renderer esistente («Carica dalla scena» → modifica → «Associa alla scena»).
- Import JSON locale con limite 128 KiB, controllo profilo robot, riferimenti, capacità, mapping, struttura e consensi; export e salvataggio browser-local già nello Studio.
- Paky-02 resta separato: il preset Paky-01 non può essere applicato al profilo dell'altro robot.

## Autorità e provenienza
Copia **fissata byte per byte** di `italiarobotica/paky-01@92c26dd03c52bcec48b2e9906a395a414f2fc064`:
`profiles/visual-feedback/paky01-eyes-v0.1.preview.json`, SHA-256 `ae3178993e254513e049474ade7d4cb825f984069fd770ac2959f763bbddf563`.

Il profilo di macchina in Paky-01 resta la fonte della verità; la copia in Console è una fixture di anteprima con provenance, non un secondo formato canonico e non riceve aggiornamenti automatici. Aggiornamenti futuri richiedono cambio del riferimento fissato e test.

## Come usare
1. Aprire `/visual-effects` da una build del ramo con PR Console Visual Studio; selezionare Paky-01.
2. Esportare eventuale bozza locale prima di sostituirla.
3. Premere **Carica repertorio v0.1** e confermare.
4. Selezionare uno stato/gesto nella griglia per l'anteprima dei due occhi.
5. Aprire **Editor occhi**, premere **Carica dalla scena**, regolare i parametri e **Associa alla scena**.
6. Il browser salva la bozza per robot; esportare il JSON per una revisione controllata. Il Catalog Manager storico continua a usare snapshot locali in sola lettura.

## Limiti
Solo UI simulata. Nessuna connessione ESP32, BLE, MQTT, USB, PERIPH, actuator, Cognitive o API di persistenza. Il catalogo non modifica il servizio live né il firmware. Per lo stato live e la sincronizzazione si seguiranno le PR/contratti upstream e la procedura di collaudo dei pannelli reali.

## Verifica
`node --test scripts/paky01-eyes-preset.test.mjs` e `cd apps/web && npm run typecheck && npm run build`. I test dell'anteprima non sostituiscono il collaudo hardware.
