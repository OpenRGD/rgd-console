/** Structural source metadata only. Never infer calibrated pose or identity. */
export type NominalRpy = readonly [number, number, number];

export function nominalRpy(value: unknown): NominalRpy | null {
  if (!Array.isArray(value) || value.length !== 3 ||
      ![0, 1, 2].every(i => typeof value[i] === 'number' && Number.isFinite(value[i]))) return null;
  return [value[0], value[1], value[2]];
}

export function describeNominalRpy(value: unknown): string {
  const rpy = nominalRpy(value);
  return rpy ? rpy.map(n => String(n)).join(' / ') : 'Non noto';
}

export function nominalRpyCoverage(joints: readonly { origin_rpy_rad?: unknown }[]) {
  const declared = joints.reduce((count, joint) => count + (nominalRpy(joint.origin_rpy_rad) ? 1 : 0), 0);
  return { total: joints.length, declared, unknown: joints.length - declared };
}
