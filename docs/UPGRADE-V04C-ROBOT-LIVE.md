# OpenRGD Console v0.4C — Robot Live Foundation / Ubuntu 22.04

**Scope:** Browser-only Live UI and responsive display profiles. **Not** a BIOS, bootloader, Wayland resolution manager, auto-login, power controller or motor command panel. OpenRGD v0.4B on the Ubuntu mini-PC was already observed healthy: four containers and HTTP 200. This update keeps that topology.

## 1. Autostart after reboot: already configured, still needs a reboot acceptance test

Your earlier terminal report showed:

- `systemctl is-enabled docker` = `enabled`
- `api`, `web`, `gateway`, and `module-agent` = Docker `RestartPolicy.Name: unless-stopped`

**Expectation:** after an ordinary OS boot Docker restarts those previously running services. This depends on the daemon starting normally and those containers not having been explicitly stopped. It does not require logging into the GNOME desktop. It does **not** automatically open a kiosk/browser session.

A real reboot acceptance test is outstanding. Perform it only when safe for the robot and other workloads connected to the mini-PC. First ensure no separately configured controller service would cause unintended movement; OpenRGD Console itself has no motor command path.

After reboot and reconnecting to the Ubuntu desktop:

```bash
cd ~/openrgd/repos/openrgd-console
systemctl is-active docker
sudo docker compose ps
python3 scripts/doctor.py
curl -fsS http://127.0.0.1:8088/healthz
```

The URL `http://127.0.0.1:8088/onboarding` should be available after the services start. If you use a browser on a DIFFERENT computer, `127.0.0.1` refers to that other computer; use an SSH tunnel, not an unauthenticated LAN bind.

## 2. Install v0.4C without touching runtime/data

Download/transfer `openrgd-console-foundation-v0.4C.zip` into `~/Downloads/` on the mini-PC. Then execute **without sudo**:

```bash
mkdir -p ~/openrgd/artifacts/console-v04c
unzip -q ~/Downloads/openrgd-console-foundation-v0.4C.zip \
  -d ~/openrgd/artifacts/console-v04c
bash ~/openrgd/artifacts/console-v04c/openrgd-console/scripts/upgrade-v04c.sh
```

The script makes a private archive backup under `~/openrgd/backups/`, updates Console source files, and preserves `config/`, `.env*`, local `data/`, `console_data`, and `module_data`. It doesn't call Docker or touch the BHL/STM32 installations. Do not run `docker compose down -v`, as it deletes volumes.

Rebuild only the Next.js Web image, **without restarting API or Module Agent**:

```bash
cd ~/openrgd/repos/openrgd-console
sudo docker compose config --quiet
sudo docker compose up -d --build --no-deps web
sudo docker compose ps
python3 scripts/doctor.py
```

The existing `doctor.py` now checks `/onboarding`, `/live`, and `/live/configure`. A temporary `502` immediately after Web replacement can happen before the new process becomes ready; recheck when it is up. To diagnose persistent errors:

```bash
sudo docker compose logs --no-color --tail=80 web gateway
```

**Do not reinstall Calibration.** Its `module_data` remains intact. On this wave the Rust backend still reports version `0.4.1` (v0.4B); the display UI is `v0.4C`. This is expected, not a broken upgrade.

## 3. Test Live at 1920×1080 before the physical five-inch display

Your development screen is currently an HDMI 1920×1080 display with a Wayland GNOME session. The five-inch display is **not** connected. Test in the existing browser:

- `http://127.0.0.1:8088/live/configure` — edit browser-local display preferences, preview 800×480, 1024×600, 1280×800, 480×800 or custom logical CSS sizes; inspect layout and font scale.
- `http://127.0.0.1:8088/live` — full-viewport read-only Robot Live UI, with touchscreen-sized buttons, robot selector, overview/signals/events, Browser Fullscreen button.
- `http://127.0.0.1:8088/overview` — normal Console Development mode.

The preview **does not change HDMI, Wayland, kernel display settings or native monitor resolution**. When the real touchscreen is connected, verify its native mode, pixel density, rotation, and touch input independently; only then consider an automatic kiosk session.

The Firefox Fullscreen button is a browser-only operation. To manually try kiosk during a development session (no autostart configured by this package):

```bash
firefox --kiosk http://127.0.0.1:8088/live
```

Exit the browser using `Alt+F4`. If you previously created `~/.config/autostart/openrgd-console.desktop` during experimentation and don't want to run kiosk at login, disable that *existing* entry manually before reboot.

## 4. Safety and read-only semantics

- Selecting `OpenRGD Simulator` shows **SIMULATOR** and synthetic values.
- Selecting unbound `Paky-01` shows **ROBOT FISICO** but no fabricated joint positions, voltages or camera state.
- WS online means the browser-to-Console WebSocket works; it does not mean a physical controller is online.
- Calibration `ready` means local software integrity only, not physical calibration.
- Stale values are hidden after ~5 seconds, not presented as fresh readings.
- No sleep/wake control, Linux session switch, autologin, BIOS/UEFI changes, disk writes, CAN access, or motor commands are added by Live Mode.
- Display preferences use localStorage in the **current browser/profile** and do not automatically follow a future kiosk OS user. Persisting profiles per robot/host is a later milestone.

## 5. Acceptance checklist

- [ ] Console still reachable at `/onboarding` after rebuilding Web
- [ ] `python3 scripts/doctor.py` passes Live v0.4C route checks
- [ ] `/live/configure` displays accurate CSS viewport previews
- [ ] `/live` shows simulated telemetry explicitly marked SIMULATOR
- [ ] Select Paky-01: physical readings unavailable, motor control blocked
- [ ] Verify browser Fullscreen button and return to `/overview`
- [ ] Calibration still `ready` in Modules; previous reports intact
- [ ] After a **separately safe** reboot, Docker services return automatically
- [ ] No auto-login/kiosk modification made by this upgrade

**Next wave:** separate OpenRGD Boot Manager (canonical `rgd check`, `rgd boot`, recovery report) and a local, authenticated session-control service. Do not implement them as arbitrary browser-to-shell commands.
