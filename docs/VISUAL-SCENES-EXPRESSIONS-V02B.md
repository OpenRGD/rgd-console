# VISUAL-0.2B — Visual Effects Studio: expression catalog and multi-zone scene preview

**Status:** browser-local candidate. **No deployed Cognitive System, physical mini display, BLE pairing or Console API change.** Stacked on Console Expressive Eyes PR #8 and Visual Studio PR #7.

## What changed

The Visual Effects Studio page now treats **expressive eye displays** as a typed output zone, alongside existing RGB ring and optional room lights:

1. The scene editor works with the new opt-in `openrgd.visual-studio.profile.v0.2-candidate` scene model: existing RGB targets remain `{zone_id,effect,color,brightness}`; an eye target is `{zone_id,effect:"eye_expression",expression_id}`.
2. The browser-only profile stores a bounded `expressions` catalog. Each `expression_id` points to a declarative Eye Expression recipe (no shaders, arbitrary JS, scripts, device addresses or images from remote URLs).
3. The Eye Renderer now has an explicit **Associa alla scena (bozza)** button. A conscious operator action stages a validated operator or synthetic Cognitive recipe into the current scene. Replacing a named catalog recipe requires a separate confirmation because it can change other referencing scenes.
4. The current scene simulator renders both the virtual RGB ring and two **virtual** eye displays for the referenced recipe. Mixed scenes may include room lights, but physical availability is never implied.
5. Each logical display declares a capability `eye_expression` and a `planned` binding. `planned` is **not** live connected status.

## Separate Paky-01 / Paky-02 preview workspaces

- The UI has an explicit robot-preview selector. Paky-01 retains the operator-reported BLE ring and **planned** eyes. Paky-02 is a purely synthetic fixture: all lighting/display bindings are planned.
- Each robot keeps a separate browser draft catalog and scene profile under `openrgd.visual-studio.preview.v0.2.<robot_id>`; neither is a runtime or robot profile.
- The synthetic `meraviglia_curiosa` proposal for Paky-02 is preassociated with Paky-02's welcome preview. Paky-01's initial scenes do **not** receive that cognitive expression silently.
- The Eye Designer checks `robot_id` before letting an explicit operator stage a cognitive-sourced expression. It may display another robot's proposal in preview, but refuses to assign or save it under a mismatched robot. There is no authenticated cognitive process in this stage.

## Non-destructive draft migration

- Legacy Paky-01 browser key `openrgd.visual-studio.preview.v0.1` is read only when no Paky-01 v0.2 draft is present.
- Existing saved v0.1 scene mappings and colors are carried forward. A **planned eye zone** and empty catalog are added, but **no expression is silently inserted into existing scenes**.
- The migrated draft is written to a *different* localStorage key `openrgd.visual-studio.preview.v0.2.paky-01`. The original v0.1 saved profile remains intact until the operator explicitly chooses **Ripristina**.
- The original v0.1 source profile and validator remain intact in the Visual module; the v0.2 schema is separately versioned.

The fresh **Paky-02** preview includes a synthetic `meraviglia_curiosa` expression in the welcome scene. Paky-01 starts without an eye scene assignment. These are fixtures for demonstration, not approved Cognitive memory or physical display effects.

## Future Cognitive behavior

The Cognitive System will be able to propose brand-new `expression_id` values with bounded parameters; it must never write to the live Visual daemon's software or pair hardware. Before physical execution, proposals require a separately authorized, authenticated, time-bounded ingress with replay rejection, source arbitration, capabilities checks and fallback. Persistent catalog updates require explicit operator review/approval, version and rollback.

A Cognition-generated name is a *representation label*, not proof of the robot having subjective feelings.

## Testing and rollout

- Run `npm run typecheck` and `npm run build` inside Console `apps/web`.
- Browser QA: choose welcome and check ring + two eyes; edit `Meraviglia curiosa` then stage; create a new expression ID; switch scenes and assert independent mapping; export JSON and run the Visual module's v0.2 profile validator against it.
- Confirm that a v0.1 local draft migrates without losing colors/mappings.
- No new API routes, host agent permissions, runtime service restarts, LED commands, CAN, Somatic, IMU or persistent robot profile changes are included.

## Limits

The Console duplicates browser-only preview validation but does not certify exported profile validity; trusted validation belongs to the source-of-truth Visual module. The eye graphic is a **low-resolution geometric simulation** and not a physical hardware specification. Clock, blink scheduling and actual screen drawing will require a later PERIPH-bound adapter.
