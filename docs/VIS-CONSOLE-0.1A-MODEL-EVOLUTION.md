# VIS-CONSOLE-0.1A — Source model XYZ/RPY + Evolution/Visual revision boundary

**2026-11-17 · IMPLEMENTATION CANDIDATE / READ-ONLY / NON-NORMATIVE.**
**Base:** `OpenRGD/rgd-console` current `main` (`c996039`), deliberately **not** stacked on old draft #2/#10. No production deployment, ZIP media imports, actuator controls or schema-authority promotion.

## Actual source-model metadata implemented in 0.1A

Existing Console model imports read the ZIP source tree's `spec/01_foundation/description.jsonc` into `ImportedModel` but previously dropped the **local joint RPY orientation**, making faithful URDF link transformations impossible for future visual 3D assets.

This scoped change preserves optional `origin_rpy_rad` on `RgdJoint` from the declared `geometry_ideal.origin_rpy_rad_vec3_float`. The source's existing XYZ, axes, limits, robot links and model ZIP hash are untouched. Historic stored model JSON is still readable with the field missing or `null`: **unknown source orientation is not claimed equal to a verified physical 0°**. This metadata is ideal, source-declared, not current encoder measurements or as-built geometry.

- Rust: `services/api/src/model.rs` optional `origin_rpy_rad` with `serde(default)`; `model_import.rs` extracts finite length-3 source angles.
- Web: `apps/web/src/lib/contracts.ts` optional field for legacy imports.
- Console JSON schema: additive optional field, source-only.
- Rust tests cover real ZIP-backed JSONC import with XYZ/RPY, a missing RPY (not invented), and legacy stored struct backward compatibility.

### Already defined by canonical OpenRGD (source-checked)

- `spec/01_foundation/description.jsonc`: ideal body geometry and embedded `embodiment_config.assets_manifest`.
- `spec/01_foundation/calibration.jsonc`: declared instance-specific deltas from ideal body.
- `spec/01_foundation/wear_fatigue_model.jsonc`: theoretical wear models, not telemetry.
- `spec/05_evolution/hardware_mutation.jsonc`: policy for physical changes (historic Ship of Theseus / 75% threshold).
- `spec/05_evolution/plasticity.jsonc`: limits on self-change/learning, not a CAD autoswap daemon.
- `spec/05_evolution/genealogy.jsonc`: candidate origin, lineage and mutation-log projection.
- Other Evolution files: `replication`, `digital_resurrection`, `termination`.

**Crucial:** `05_evolution` is **PROPOSAL** in `spec/manifest.jsonc` and its files are NOT selected by the reference kernel module load order. Their sample thresholds and historical entries cannot be treated as active laws, verified history or identity authorization. In particular a 75% component replacement is **not** an accepted trigger to revoke/register an RIN, issue a Life or prove identity discontinuity.

## Recommended RGD revision architecture (CONTRACT DESIGN; not implemented by this PR)

Think of a ZIP-backed `.rgd` as an **immutable, exportable snapshot** of an evolving robot, *not* a file that the runtime edits destructively every time something changes. The canonical OpenRGD `spec/` is content-addressed; a proposed optional companion can include its chosen visual revision and current as-built projection with externally verifiable history links.

The required distinct values are:

```text
RGD specification source_root  -> reviewed design/kinematic revision
    └─ visual_asset_set_sha256  -> independent render/LOD/CAD revision (GLBs)
physical_instance_id/enrollment_ref -> physically installed as-built revision
    └─ calibration_revision     -> verified offsets/extrinsics/encoder signs for that installed configuration
life_id / active LifeBinding    -> separate, externally issued experiential continuity; NEVER inferred from model or CAD
History / Chronon anchor refs   -> authenticated append-only mutation evidence; source of genealogy projections
```

**Mutation categories / consequences:**

| Category | RGD source root | Visual revision | As-built revision | Calibration/safety |
| --- | --- | --- | --- | --- |
| New optimized GLB/LOD/material for same original CAD | same | changes | same | no physical implications |
| Actual replacement of printed shell | maybe same design | changes | changes | evaluate altered mass/contact/collision evidence |
| Sensor relocated | may stay same | optional | changes | sensor extrinsics become stale until reverified |
| New actuator/joint geometry | perhaps new design | changes | changes | joint mapping/encoder zero/envelopes invalidated, fail closed |
| Skill/policy plasticity | same body | same | same | governed by separate Agency/Plasticity policy; not CAD |
| Reboot/restore/fork | independent | independent | not implicitly replaced | external Life/History issuer decision; no automatic clone |

Mutation events must record previous/new **immutable digests**, source evidence and claim status; no mutation may mark itself as externally verified merely by importing a ZIP or presenting a proof string. Genealogy in a portable `.rgd` is a digest-linked **read-only projection**, while actual authenticated History/Chronons belong to the History writer. `spec/` changes create a new immutable source revision and hash, not an overwrite.

For compatibility with candidate Core-C (PR #13), a RGD/model revision can preserve Life continuity **only after external revalidation of exact Life binding/source context**; a Life ID is never minted by the Console. Candidate Core-D (PR #14) requires separate qualified history/commit times and authenticated receipts. Neither candidate implements those external authorities.

### Metadata still to freeze before secure visual ingest (P0, NOT implemented)

Proposed extra read-only keys (shape/names subject to candidate contract review):
- `source_root_digest` — authenticated only after a real `rgd check`, otherwise `null`.
- `visual_asset_set_digest` — digest of verified `assets/visual/manifest.json`, otherwise `null`.
- `as_built_revision_ref` — separately reviewed physical installation snapshot, otherwise `null`.
- `mutation_history_refs[]` — externally resolved immutable History refs (not trusted inline event text).
- `calibration_revision_ref` — externally verified calibration for exact installed graph, otherwise `null`.

`ImportedModel.model_id` today remains `rgd-` + first 20 hex of the **whole uploaded ZIP SHA-256**. This is still a correct legacy importer/archive identifier, **not** a durable physical robot ID or Life ID; changing a mesh in the ZIP changes this ID. Migration to separate `source_root`, `asset_set` and `as_built` identities must be explicit, versioned and backward compatible. A visual-only update may be a separately content-addressed companion, not an unrelated new robot enrollment.

### Safe rollout of future stages

1. Freeze `rgd.visual-assets.v0.1-candidate` and Evolution crosswalk in [OpenRGD/openrgd#7](https://github.com/OpenRGD/openrgd/pull/7); no normative `spec/` mutation.
2. VIS-CONSOLE-0.1B: separate, bounded, validated metadata/media intake with no implicit `paky-01` binding. Preserve 8 MiB/16 MiB legacy ZIP limits until independently reviewed.
3. VIS-CONSOLE-0.1C: isolated candidate API, model registry and storage. The old `:8099` browser canary proxies GET to the **production** API and rejects POSTs (405), so it cannot perform safe isolated import tests.
4. VIS-CONSOLE-0.2/0.3: verified read-only asset descriptor endpoint and GLB per-link renderer. Missing/unsafe geometry stays schematic; no motor/encoder FK without independent calibration.
5. VIS-CONSOLE-0.4: approved Paky-01 as-built overlays and provenance with independent Life/binding/Chronon authority.

**Main Console (8088), motor bus, physical IMU publisher, canonical RGD source and original preview (8099) must not be changed by 0.1A.**

Cross-reference: [Console #14](https://github.com/OpenRGD/rgd-console/issues/14) for actual delivery gates; [Paky-01 #5](https://github.com/italiarobotica/paky-01/pull/5) for 26 CC BY-SA 4.0 original mesh links.
