# CAL contract snapshot — exact owner files, non-normative consumer pin

Source: [CAL #9](https://github.com/OpenRGD/rgd-calibration/pull/9) at `646dbc05bcefd15942b25bb55b3c99096f0cccc9`. The installed Registry remains pinned to CAL-0.2.0 `81700401e2fa6d370a86b6c1f5a48802bc5f1fc7`.

- `passive-report.v0.2.schema.json`: upstream blob `8c5080a7e36b728581caaa9332d7dea5e8659f41`
- `calibration-profile.v0.1.schema.json`: upstream blob `30ba581d528d66011dca69d6ecd29da7ba1f22b5`
- `LICENSE`: upstream blob `ec2d73b95bc762f1dc84af7bf0548d9eaea756e0`

CAL-021-C fixes the Measurement reference to the profile's actual schema ID; the released profile blob is identical and the passive-report schema differs only in that reference. Preserve upstream bytes and IDs. This is a reviewed local dependency snapshot, not a new Console-owned schema fork; update explicitly with CAL owner review, never resolve remote schema URLs at runtime. MIT notice retained.
