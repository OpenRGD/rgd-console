# Upgrade OpenRGD Console v0.4A → v0.4B — Ubuntu 22.04 / Fedora

**Current reference machine:** mini-PC Ubuntu 22.04, Console v0.4A operational, Module Agent running; `org.openrgd.calibration@0.2.0` already reports `ready` and a binary SHA-256. This update **does not reinstall** Calibration, does not touch BHL/STM32 and does not read or move motors.

## 1. Update only Console sources

Transfer `openrgd-console-foundation-v0.4B.zip` to `~/Downloads` on the mini-PC, then run these commands **without sudo**:

```bash
mkdir -p ~/openrgd/artifacts/console-v04b
unzip -q ~/Downloads/openrgd-console-foundation-v0.4B.zip \
  -d ~/openrgd/artifacts/console-v04b
bash ~/openrgd/artifacts/console-v04b/openrgd-console/scripts/upgrade-v04b.sh
```

The script creates a timestamped source archive under `~/openrgd/backups`, then overlays **only** Console source files. It preserves the existing local `config/`, `.env*`, `data/` and Docker volumes. The `module_data` volume retains the already-installed and integrity-checked Calibration binary; `console_data` retains robot instances and imported models.

The agent Dockerfile now explicitly sets `0644` permissions on its Python files. This incorporates the earlier mini-PC fix for `server.py: Permission denied`. Caddy retains the previously needed `NET_BIND_SERVICE` capability.

## 2. Build and restart the four services

```bash
cd ~/openrgd/repos/openrgd-console
sudo docker compose config --quiet
sudo docker compose up --build -d
sudo docker compose ps
python3 scripts/doctor.py
```

If a build fails, capture the actual output from `sudo docker compose up --build -d`. For running services use:

```bash
sudo docker compose logs --no-color --tail=90 api module-agent web gateway
```

**Do not use `docker compose down -v`: it deletes your robot and installed-module volumes.** No folder in `~/shared/BHL` should be moved or modified. The Console remains bound to `127.0.0.1:8088`, not exposed to the LAN. Access remotely only through an authenticated SSH tunnel.

## 3. Verify that the existing Calibration installation survived

```bash
curl -fsS http://127.0.0.1:8088/api/v1/modules/catalog \
  | python3 -c 'import sys,json; c=json.load(sys.stdin); print([(x["descriptor"]["id"], x["installation"]["state"]) for x in c["catalog"]])'
```

Expected for the previously installed module: `('org.openrgd.calibration', 'ready')`. The version should remain `0.2.0`. If the status is `source_only`, `not_installed` or `tampered`, **do not proceed to inspection**: inspect the Module Agent logs and volume state instead. Never delete the volume to fix an integrity error.

## 4. Run the first passive inspection from the Console

Open `http://127.0.0.1:8088/modules`.

Under **Calibration · Passive Inspection**, select an **imported physical robot instance associated with an RGD profile**. The built-in static `paky-01` entry has no imported model mapping yet; it does not become physically calibrated merely because we installed the module.

If no eligible instance exists:

1. Open **Onboarding**, import `examples/synthetic-foundation-partial.zip` (strictly synthetic test fixture).
2. Register a separate test instance, e.g. `Synthetic CAL test`, from that model.
3. Return to **Modules → Calibration** and select the new instance.
4. Click **Ispeziona profilo RGD**. It reads only the declared model content, computes candidate coverage and findings, and shows `physical_calibration_certified: false`.
5. Optionally use **Esporta JSON**. The most recent preview is also saved in the Console data volume and is accessible via GET `/api/v1/robots/{id}/calibration/last`.

Alternatively, run the CLI smoke test from the Console source directory:

```bash
python3 scripts/calibration-smoke.py
```

It selects the first model-linked imported instance (or use `--robot instance-0001`). All preview operations are non-actuating.

## 5. Expected limitations

- This is *passive* CAL-0.2: no homing, no measured joint angle, no real drift detection, no motor commands.
- The inspected bundle is **not yet canonically verified** by `rgd check`. We compare its ZIP bytes against the import registry SHA before sending it to the Agent; that is not canonical model integrity.
- Neither the Session, physical readiness nor Somatic Runtime safety state is changed.
- The UI for Calibration is a bundled Console integration adapter, **not a generic dynamically loaded frontend plugin**.
- An installed binary with `ready` indicates local software integrity, **not** that Paky-01 is calibrated or safe to move.

## 6. Regression checklist

- [ ] Four containers are `Up`; Docker named volumes were not removed
- [ ] `scripts/doctor.py` returns PASS and version 0.4.1
- [ ] Module catalog reports Calibration `ready` with unchanged digest
- [ ] Imported RGD model and instance remain visible
- [ ] Passive inspection returns JSON and no physical claims
- [ ] After `sudo docker compose restart`, last report is still available
- [ ] Simulated and physical telemetry remain visibly separate
- [ ] No CAN/STM32 operations performed by the Console

**Build status:** v0.4B source tests passed in the authoring environment; complete Cargo + Next.js + Docker build and actual CAL-0.2 CLI integration **must still be tested on the mini-PC**.
