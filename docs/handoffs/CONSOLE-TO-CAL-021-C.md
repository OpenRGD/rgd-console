# CAL-CONSOLE-021C — Return handoff (candidate, source only)

Source: Console main `b331dd32415eeda0d107676920a6dea91170cc4f`, CAL [#9](https://github.com/OpenRGD/rgd-calibration/pull/9) at `646dbc05bcefd15942b25bb55b3c99096f0cccc9`; [incoming handoff](https://github.com/OpenRGD/rgd-calibration/blob/646dbc05bcefd15942b25bb55b3c99096f0cccc9/docs/handoffs/CAL-021-C-TO-CONSOLE.md). Existing Registry pin CAL-0.2.0 `81700401e2fa6d370a86b6c1f5a48802bc5f1fc7`, unchanged.

## Scope and matrix

| Boundary | Candidate change | Remains gated |
|---|---|---|
| Report | Offline complete owner Draft 2020-12 schema with local actual Measurement ID; exact upstream snapshots and MIT notice. No-profile route requires explicit nulls, no_profile, no saved measurements and consistent counts. | CAL owns report/profile semantics; no canonical promotion. |
| Source | Match exact set/role/path/digest to bytes actually extracted, recheck private snapshot; no paths taken from untrusted report for IO. | Only five Foundation files; ZIP hash and root identity different. |
| Parser | Conservative local CAL-only validation of scratch JSON/JSONC; original bytes unchanged. Test all 22 owner corpus entries; legacy CR-only line comment rejected because registered CAL-0.2 parser differs. Same-root .json sources rejected by current .jsonc-only route, mirrors outside selected root unchanged. | CAL owns actual parser. No importer rewrite or retroactive invalidation; revisit legacy restriction at CAL-021-D. |
| API/UI | Existing API relay adds explicit no-profile/history guard, UI refuses incompatible historical report and distinguishes saved report from new inspection. Existing version/fields/paths preserved, no data migration/delete. | Real API positive/negative integration and browser QA, full legacy cache revalidation, migration and rollback in D/E. |
| Runtime | Module Agent image adds Debian python3-jsonschema, exact local schemas. CI uses pinned jsonschema 4.23; Docker smoke loads actual distro implementation. | No deployment, install, Registry update, device access or host privilege; no new endpoint or CLI args. |

A local schema result is structural conformance, and matching extracted digests proves consistency only with that private extraction, not authenticity, physical binding, calibration validity or canonical root. JSONC gate is deliberately conservative, not a second authoritative parser.

## Proposed Core-owned identity path — design only

Use the existing API digest-verified original ZIP and private extraction with a separate reviewed allowlist for the complete original spec/ (manifest, kernel and Core-selected documents). Maintain archive size, count, uncompressed and per-entry bounds, no path escapes/links/ambiguous roots, immutable raw bytes, no user-supplied path or CLI args. Core must confirm source-selection, manifest self-hash and completeness/schema verifier interface/version before implementing full spec extraction. Consume Core-owned verifier via pinned read-only interface, correlate per-file digests on the same snapshot; preserve source ZIP SHA independently. Return optional `cal.canonical-identity.v0.1-candidate` as a separately versioned sidecar, never change `console.calibration-inspection.v0.4b` or replace `canonical_not_verified` by an invented claim. No verifier port/proxy, install or device access in this PR.

## Validation and rollout gates

- Dedicated pinned conformance workflow builds actual legacy and candidate CAL binaries, runs actual Agent with injected Registry resolution, corpus and synthetic exact-source checks, validates wrapper using the owner schema ID. Foundation tests cover local HTTP Module Agent mocked/fixture CLI, malformed schema/Measurement/context/digests, web typecheck/build and Docker boot. Read actual CI on the PR head before reporting PASS.
- Historical previews remain read-only and are not rewritten/resealed; incompatible data requires a fresh passive inspection, not an automatic migration. API/GUI live preview on Fedora with synthetic ZIP, actual installed binary and mixed old/new image pairing, baseline rollback and volume preservation in D/E. No runtime claim from these tests.
- Registry descriptor and binary version unchanged. Coordinate release/package migration with CAL/Registry owner only after acceptance; keep v0.4.3 rollback path.
- No PERIPH, IMU, Voice, RI or publisher changes. No calibration authority, motion or physical commissioning. Draft until review.
