# Visual Effects Studio — Expressive Eyes v0.1 (sandbox)

**Status:** proposed, browser-only implementation. Stacked onto Console Visual Effects Studio PR #7, independent from Console `main`. No production LED service, cognitive backend, PERIPH binding, mini display or robotic actuator is accessed.

## What this adds

Under `/visual-effects`, a new **Eye Renderer · Emotional Expressions** workspace simulates two physical mini displays. Operators can:
- Edit a newly named visual expression with a stable snake_case identifier, two independently parameterized eyes, palette and bounded duration.
- Preview lid openness, left/right asymmetric brows, pupil size, binocular gaze and slow blink/breathe/scan motion on two simulated screens.
- Paste a **synthetic cognitive proposal** with a versioned JSON contract and render its eye recipe without changing the robot.
- Save up to 24 expression **drafts to browser localStorage only**, explicitly via an operator click (and confirmation), or export a JSON file for separate review.
- Use CSS `prefers-reduced-motion` for no pupil animation or timer-driven blinking.

The Console demo fixture is based on the proposed Visual repository contract in the stacked PR for `feat/visual-expressions-v0.1`, not on an existing cognitive agent.

## Contract ownership

Visual Feedback owns `contracts/eye-expression.v0.1-candidate.schema.json` and `contracts/cognitive-expression-proposal.v0.1-candidate.schema.json`, plus the Python validator and normalized renderer plan. The Console duplicates only a strict **client-side preview validator** to reject obviously malformed proposals. This must not be interpreted as trusted runtime validation.

Cross-modal semantics may later use the separate `OpenRGD/openrgd` feedback candidate, but expression geometry and palettes remain Visual-specific. Neither Voice Studio nor Audio Feedback defines pupils or blink animations.

## Future Cognitive System

A future cognitive producer may propose a *new visual metaphor* like `meraviglia_curiosa`, complete with:
- source identity, sequence, robot ID (to be authenticated by a trusted host ingress, **not** from JSON claims);
- a new, non-enumerated expression identifier and human-readable label;
- bounded valence/arousal/intensity **presentation** coordinates, not the robot's true emotions;
- bounded eye geometry, iris/background/accent colors and effect duration.

The current candidate enforces `transient_preview`, `hardware_execution_authorized=false`, `approval_required_for_persistence=true` and `non_actuating=true`. It cannot auto-save or auto-apply a newly generated expression to real displays.

**Live dynamic expression mode** may be considered only after PERIPH hardware ownership, trusted producer attribution, arbitration/preemption, accessibility policies, renderer performance and physical display tests are completed. A runtime policy should permit only bounded parameters and explicit short TTL, not arbitrary script generation.

## Limits and validation

- No new API endpoints, Docker volumes, BLE connections, provider calls, device mounts or robot firmware changes.
- Preview does not prove actual emitted light or a cognitive internal feeling.
- Blink interval is 2.5–12 s, duration 80–250 ms; motion `still|breathe|scan` only.
- A future display driver must declare resolution, update rate, color capabilities and power boundaries; the browser preview does not infer them.

Verification: `cd apps/web && npm run typecheck && npm run build`. Existing unrelated Console CI failures must be addressed independently.
