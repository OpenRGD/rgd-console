# VISUAL-0.2D — Expression Catalog Manager (manual read-only snapshot)

**Status:** candidate, Console browser-only viewer. No live catalog service, direct mini-PC filesystem access or BLE/eye-display control is added. This PR builds on Console Visual Scenes & Expressions PR #9 (which itself builds on PR #8 and #7).

## Operator scenario

The Paky-02 catalog is already tested locally through three revisions of `curiosita_gentile`:
- Revision 1: a synthetic cognitive proposal is approved.
- Revision 2: an operator-designed variant is approved.
- Revision 3: rollback to the original recipe, with all revisions retained.

In this wave the operator explicitly exports a **redacted read-only snapshot** with the local CLI from the separately reviewed Visual Feedback snapshot PR. The Console does **not** connect to the filesystem or call a backend API for catalog mutations.

**Demo source:** `OpenRGD/rgd-visual-feedback` PR #7, `visual_catalog.py snapshot` and its `openrgd.visual.catalog-snapshot.v0.1-candidate` contract.

## What the new Visual Studio component does

- Robot-scoped import via file selector (currently Paky-01 or Paky-02). A mismatched robot ID is rejected and never silently shown under the other robot.
- Strict client-side field/shape and semantic checks (64 expressions, 64 revisions each, 128 proposals, file ≤2 MiB). Detects missing revisions, duplicate expression IDs, invalid rollback source references, inconsistent approval source references, unsupported schema and any assertion of hardware authority.
- Displays a library of approved expressions, latest revision and action, plus a separate proposal queue.
- Provides **two virtual pairs of eyes side by side** for any two selected historical revisions and highlights changed eye geometry, palette, timing and affect-presentation parameters.
- Shows preview-only proposal recipes and their declared origin; cannot approve, reject, restore, export a new scene or issue a hardware command.
- Keeps imported data **in browser memory only** until the selected robot is changed, the snapshot is closed or the page is reloaded. No localStorage persistence, fetch/XHR request, upload or URL sharing is performed.
- The resulting Viewer section sits inside `/visual-effects` and can be opened through an anchor link at the top of the Studio.

## Evidence and trust distinctions

- `integrity_validated_during_export:true` means the exporting local CLI checked hashes and link coherence **on the source mini-PC at export time**.
- A JSON snapshot is **not signed or independently cryptographically attested**, and the Console does not verify the source device identity. The UI therefore explicitly labels it as a manually imported file, **not live data**.
- Browser checks catch malformed payloads and structural inconsistencies; they do **not** prove a SHA-256 chain or that the screenshot reflects light physically emitted by displays.
- Showing an approved expression in the Catalog Manager does not authorize it for live eye/display output, nor claim the robot experiences that emotion.

## Validation and safety gates

This is a **web-only** change: run `npm run typecheck` and `npm run build` in `apps/web`. General Console API/contract/Docker failures (if present) must be tracked separately; no backend or module-agent access is added by this PR.

Before live catalog sync or approvals directly through Console, review a separate authenticated mini-PC host service with:
- versioned read/export endpoints;
- explicit operator identity and authorization, CSRF protections;
- no direct mount of the per-user catalog or BLE socket into Docker;
- read/write isolation, conflict revision checks and append-only audit semantics;
- no inferred permissions for physical display effects.

## Manual acceptance

1. Export Paky-02 catalog with `visual_catalog.py snapshot` into a private JSON file outside public directories.
2. Visit Visual Effects Studio, select Paky-02, import that file.
3. The library should display `curiosita_gentile` with three revisions. Compare 1 vs 2 (different eyes/colors), then 1 vs 3 (same recipe).
4. The Proposals tab should show approved cognitive and operator proposal metadata, with no source envelopes or device configuration.
5. Switch to Paky-01 and verify the Paky-02 file is refused. Verify no localStorage record is written and no LED service is invoked.
