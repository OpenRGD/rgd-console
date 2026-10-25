# Physical Observation — design-only candidate v0.1 (for future Console v0.5A)

**Status:** contract proposal only; **not implemented in v0.4B**, not yet a Canonical Core standard or an adapter.

OpenRGD Console must not speak CAN, serial, ROS 2 or a vendor motor protocol. The future *Physical Observer* will provide versioned, typed samples and provenance from a separately verified provider. These are not motor commands.

The candidate JSON Schema is `contracts/console/v1/physical-observation.v0.1-candidate.schema.json`. It describes `robot_instance_id`, `provider_id`, `provider_instance_id`, `logical_component_id`, quality, source kind, clock domain, timestamps, sequence, measured `quantity/value/unit`, mapping/source verification and explicit `position_reference`.

## Safety invariants

- `value: null` means unavailable. Do not fill absent measurements with synthetic values.
- `source_verified: true` will require a future attestation/handshake; host snapshots and raw path strings are never sufficient.
- `mapping_verified` must remain false until a separate binding validation has taken place.
- Encoder position reference must not be inferred from a numeric angle: `absolute_joint`, `relative_since_boot` and `unknown` are materially different.
- Sample stale status must be computed using the observed clock domain and reported synchronization uncertainty, not inferred from local `Date.now()` alone.
- Any sample from a simulator must be identified as `simulated` even when published through the physical-observation API.
- `actuation_enabled` is hard-coded `false`; this schema is not an arm/disarm or movement channel.
- Safety-gated motion, calibration and emergency stop remain outside the Console.

No hardware/provider discovery, command or CAN reading is included in this wave. Do not implement device adapters here before the contract passes its own review.
