# ADR — OpenRGD Console Robot Live Foundation v0.4C

**Decision:** a responsive, read-only display client over the existing Console API. NO OS/host privileges, motor control, service startup changes, canonical RGD validation or autonomous robotics execution.

## Design boundaries

```text
Ubuntu/Fedora operating system boots (firmware → kernel → systemd)
  ├── Docker Engine (enabled; independent of GNOME login)
  │    └── existing Console services
  │         ├── API / Rust / Axum (physical sources unbound)
  │         ├── Module Agent (CAL software package integrity)
  │         ├── Gateway loopback 127.0.0.1:8088
  │         └── Web / Next.js
  │              ├── /onboarding /overview /modules ... [Development UI]
  │              ├── /live                          [Robot Live UI]
  │              └── /live/configure                [Display configurator]
  └── GNOME / Wayland desktop (normal login and session maintained)
```

Robot Live does not replace bootloader/BIOS and it cannot force an OS session switch. Future "Passa a Linux" must be backed by a separate, carefully permissioned host session controller. Simply returning to `/overview` is NOT a Linux session change. Normal Development is the default. This release does NOT add kiosk auto-login or Linux power state control.

### Display profiles

- `DISPLAY_SETTINGS_KEY = openrgd.console.live.display.v1` browser localStorage, schema settings_version `1` with input normalization and hard bounds.
- Presets: 800×480, 1024×600, 1280×800, portrait 480×800, custom 320–3840 by 240–2160.
- CSS font-scale range 0.8–1.5, high contrast, reduced motion, overview cards.
- The chosen width/height controls ONLY the preview frame. The actual `/live` route uses the browser's current viewport (responsive CSS/media queries), NOT the host's HDMI/Wayland resolution.
- Developer preview renders the real `RobotLive` React component inside a container-sized DOM element. It intentionally does **not** use an iframe because Caddy sets `X-Frame-Options: DENY` on its local gateway.
- Settings are scoped to the same browser/profile, not a multi-robot server-side device registry. An OS kiosk user will need its own config or an explicit future safe synchronization contract.

### Data trust

- `StreamStatus=live` means browser-to-Console WebSocket connected, NOT robot body connected.
- The embedded simulator is explicitly labelled. The physical robot profile remains unavailable until a verified source is integrated.
- Every measurement is checked for non-null numerical value, source, real timestamp and 5-second freshness before it is shown as current; disconnected WebSocket => no current readings.
- RGD model topology describes declared joints; it's neither geometry reconstructed in 3D nor a verified physical pose.
- CAL software status `ready` is not evidence of physical calibration or joint homing.
- Events are Console diagnostics or explicitly exposed events; no invented Chronon or model reasoning.
- No actuator commands, no power control, no host/probe endpoints, and no new backend permissions.

### Deployment plan

Only frontend files and display tests change in v0.4C. Rebuild/recreate the existing `web` container with `docker compose up -d --build --no-deps web`, retain three other running services, all volumes and module install hashes.

### Future work (not yet implemented)

- **0.4D Boot Manager:** independent bounded call to `rgd check` and `rgd boot` on a selected canonical profile. Failed validation yields a non-actuating recovery UI; never rewrites source hashes to make validation pass. Boot manager must not block access to Console diagnostics.
- **0.4E Host Session:** separate local host authorization and kiosk session handling with systemd/GDM integration; avoid root web APIs; return to desktop only by a restricted local operation.
- **0.5 Physical Observation:** versioned physical observation ingress with source clock/sequence identity and a verified read-only provider; physical motor authority remains elsewhere.
- **Power/wake:** BIOS support, Ethernet WOL packet acceptance, battery protection and hard-wired power control to be checked separately; browser cannot power on an unpowered computer.
