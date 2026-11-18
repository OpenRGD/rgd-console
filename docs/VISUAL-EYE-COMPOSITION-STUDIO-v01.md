# VISUAL — Eye Composition Viewer v0.1 (Studio, no duplicate policy engine)

**Status:** candidate / browser-only / manually imported synthetic JSON. **No live Voice integration, OLED/LCD driver, PERIPH connection, or runtime command.**

## Integration with related work

The latest eye work is split as follows, without sacrificing the earlier Studio:
- `OpenRGD/rgd-visual-feedback` PR #8: robot-neutral core pack of **21 recipes, 21 scenes, 6 Voice event mappings**, plus a validator and `eye_pack_preview.py` generator. It is the **canonical source of expressive definitions**.
- `italiarobotica/paky-01` PR #7: hardware/robot-specific prototype with 21 recipes, 21 scenes, **27 matching rules**, plus detailed behavior spec and acceptance plan. Its pinned sample is kept for reproducibility, not promoted into a second global catalog.
- `OpenRGD/rgd-console` PR #16: historical Paky-01 browser preset/editor. It now clearly labels the fixed sample as *historical* and prefers importing a generated profile from Visual Feedback. Existing local drafts, export/import confirmation, and Catalog Manager remain unaffected.
- `OpenRGD/rgd-visual-feedback` PR #10: **functional state + microphone/playback confirmation + gesture + gaze + display availability** composition in one pure preview method. This new Panel displays results from that engine, not a second policy engine.

## Workflow on Paky-01 mini-PC

Check out the **review branch** for `rgd-visual-feedback` PR #10 separately from the active BLE daemon, and generate a composition:

```bash
cd ~/openrgd/repos/rgd-visual-eye-composition-v01-review
python3 scripts/eye_composition_preview.py \
  --input examples/expressions/eye-composition-speaking-friendly.synthetic.json \
  > ~/openrgd/visual-eye-compose-speaking.demo.json
```

Open `/visual-effects` in the **review Console** build, choose **Paky-01**, then find **Eye Composition Preview**. Import the resulting JSON. It should show:

- functional phase: `speaking`; microphone *declared in synthetic fixture* as `disabled`;
- social overlay: `friendly` affects only eye geometry;
- current gaze for both eyes; ring remains functional **green `#00FF46`**;
- `hardware_commands_sent=false`, `source_authenticated=false`, `physical_output_observed=false`.

To try the generic pack on Paky-01 *without using the old fixed fixture*:

```bash
cd ~/openrgd/repos/rgd-visual-eye-composition-v01-review
python3 scripts/eye_pack_preview.py --robot-id paky-01 > ~/openrgd/paky-01-generic-eye-profile.preview.json
```

In Visual Effects Studio, use **Importa profilo JSON OpenRGD**; confirm replacing the current browser draft **after exporting any edits**. This preserves all 21 generic recipe values while keeping the declared logical display and ring zones `planned`. To preview Paky-02, re-generate the JSON with `--robot-id paky-02` and change robot selector first.

## Safety and authority

- Eye Composition Viewer **only parses and renders** a synthetic engine JSON file up to 64 KiB. It never accesses connected sensors, persistent catalogs or BLE hardware and does not upload or persist the composition file.
- It rejects malformed/authority-bearing payloads and mismatched `robot_id`. It does not check physical light output nor authenticate the displayed synthetic facts.
- Paky-01's actual ring daemon remains independently controlled by `paky-led` and Voice lifecycle IPC; the simulation does not interfere with them.
- Real chronological arbitration, one-shot admission, voice freshness sampling, link watchdog, firmware render and physical measurements require future reviewed runtime work. Blink/render animation remains the browser's decorative representation.

## Suggested manual verification

Compare `speaking + friendly + gaze` against `speaking` without gesture (edit a separate synthetic input file, not the daemon). Check the eyes change while ring green remains constant. Then test stale Voice timestamp: ring black, eyes connecting; test disabled display: simulated blank eyes but independent functional ring. In all cases verify the UI reports the data as **synthetic preview**.
