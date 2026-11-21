# Visual Effects Studio — candidate v0.1 (Console browser-only sandbox)

## Purpose

A dedicated `/visual-effects` preview in the Console allows operator authoring of **event → mapping → scene → zone** without assuming that the current RGB ring is the only physical output. The Console sidebar includes an explicitly labeled PREVIEW link.

**This is not a remote LED-control interface.** It does not issue REST/IPC/driver calls, modify the Visual Feedback runtime, open BLE/MQTT/USB, or change IMU, Somatic Runtime, Boot Manager and persistent Docker volumes.

## Current UI

- Select an event mapping from voice/system sources, change its scene, or declare a proposed new event.
- Preview scenes for face RGB ring and future room lighting targets; change color, effect and simulated brightness. Unverified effects (pulse/chase/wave) are visual design vocabulary, not proof of hardware support.
- Add scenes, associate zones, and export a JSON preview profile. Browser draft is stored under `localStorage` only. No server persistence or deploy action exists.
- Use `prefers-reduced-motion` to suppress animations. The virtual ring is marked synthetic.
- The bundled Paky-01 example is a local UI fixture patterned on `OpenRGD/rgd-visual-feedback` candidate `profiles/paky01-studio.preview.json`. The Visual repository, not the Console, is expected to own the future canonical *module-level* authoring contract (not an OpenRGD canonical RGD specification).

## API & hardware integration gates

1. Confirm the Visual Studio `openrgd.visual-studio.profile.v0.1-candidate` schema and validate imported/exported profile with a host-side module parser, not browser-only validation.
2. A trusted host relay must project **read-only** Visual `desired`, `applied`, `connected`, stale/unknown to Console; no mount of the user's Unix socket into Docker.
3. Define explicit, authenticated operator approval for any future profile application, independent from the read-only status route. Reject unsupported effects and untrusted external device addresses.
4. Isolate per-adapter permission scope and credentials (BLE, USB, Wi-Fi, MQTT). No remote lights are implicitly discoverable or controllable.
5. Define runtime rule arbitration: TTL, source priority, overlapping speech/visual events, recovery and fallback, no high-frequency flashing or unsafe brightness defaults.
6. Until a separate reviewed installer exists, `rgd-modules` Cargo-only registry cannot install the Python Visual service. Do not represent preview presence as module installation.

## Regression verification

Changes are web-only. Run `npm run typecheck` and `npm run build` in `apps/web`. The existing Console Foundation CI has unrelated known failing checks; do not mutate production services while reviewing this candidate.

## What is *not* delivered

No live audio/browser playback hook, no real LED effect designer, no per-LED pixel addressing, no remote lighting driver and no committed profile applied to Paky-01. A preview is not evidence of emitted light or robot readiness.
