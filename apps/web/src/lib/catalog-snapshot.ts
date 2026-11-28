import {validPreviewRobot} from './visual-json.ts';
/** VISUAL-0.2D read-only snapshot inspection. Not cryptographic attestation. */
import { validExpression } from './visual-expression.ts';
import type { EyeExpression } from './visual-expression.ts';

export type CatalogRevision = {
  schema_version: 'openrgd.visual.catalog-revision.v0.1-candidate';
  robot_id: string; expression_id: string; revision: number;
  action: 'approve' | 'rollback';
  source_proposal_id: string | null; rollback_source_revision: number | null;
  previous_record_sha256: string | null; expression_sha256: string;
  expression: EyeExpression; created_at_utc: string;
  actor_kind: 'explicit_local_cli_action';
  preview_only: true; hardware_execution_authorized: false;
};
export type CatalogExpression = { expression_id: string; latest_revision: number; revisions: CatalogRevision[] };
export type CatalogProposalPreview = {
  proposal_id: string; expression_id: string;
  source_kind: 'operator' | 'cognitive_proposal';
  status: 'pending' | 'approved' | 'rejected';
  submitted_at_utc: string; approval_revision: number | null;
  expression: EyeExpression;
};
export type CatalogSnapshot = {
  schema_version: 'openrgd.visual.catalog-snapshot.v0.1-candidate';
  robot_id: string; generated_at_utc: string;
  export_mode: 'manual_read_only_snapshot';
  integrity_validated_during_export: true;
  reader_must_not_trust_as_attested: true;
  preview_only: true; hardware_execution_authorized: false;
  expressions: CatalogExpression[]; proposals: CatalogProposalPreview[];
};
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const NAME = /^[a-z][a-z0-9_]{2,47}$/;
const ROBOT = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const HEX32 = /^[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function obj(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
function exact(x: unknown, fields: string[]): x is Record<string, unknown> {
  return obj(x) && Object.keys(x).length === fields.length &&
    fields.every(k => Object.prototype.hasOwnProperty.call(x, k));
}
function date(x: unknown): x is string {
  return typeof x === 'string' && ISO.test(x) && Number.isFinite(Date.parse(x));
}
function ident(x: unknown): x is string { return typeof x === 'string' && NAME.test(x); }
function rev(x: unknown, robot: string, id: string, n: number): x is CatalogRevision {
  if (!exact(x, [
    'schema_version','robot_id','expression_id','revision','action',
    'source_proposal_id','rollback_source_revision','previous_record_sha256',
    'expression_sha256','expression','created_at_utc','actor_kind','preview_only',
    'hardware_execution_authorized',
  ])) return false;
  return x.schema_version === 'openrgd.visual.catalog-revision.v0.1-candidate' &&
    x.robot_id === robot && x.expression_id === id && x.revision === n &&
    (x.action === 'approve' || x.action === 'rollback') &&
    (x.source_proposal_id === null || (typeof x.source_proposal_id === 'string' && HEX32.test(x.source_proposal_id))) &&
    (x.rollback_source_revision === null ||
      (typeof x.rollback_source_revision === 'number' && Number.isInteger(x.rollback_source_revision) && x.rollback_source_revision > 0)) &&
    (x.previous_record_sha256 === null ||
      (typeof x.previous_record_sha256 === 'string' && SHA256.test(x.previous_record_sha256))) &&
    typeof x.expression_sha256 === 'string' && SHA256.test(x.expression_sha256) &&
    validExpression(x.expression) && x.expression.expression_id === id &&
    date(x.created_at_utc) && x.actor_kind === 'explicit_local_cli_action' &&
    x.preview_only === true && x.hardware_execution_authorized === false;
}
function deepEqual(a: unknown, b: unknown): boolean {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (obj(v)) {
      const out: Record<string, unknown> = Object.create(null);
      for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
      return out;
    }
    return v;
  }
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function catalogItem(x: unknown, robot: string): x is CatalogExpression {
  if (!exact(x,['expression_id','latest_revision','revisions']) || !ident(x.expression_id) ||
    !Array.isArray(x.revisions) || !x.revisions.length || x.revisions.length > 64 ||
    x.latest_revision !== x.revisions.length) return false;
  if (!x.revisions.every((item, i) => rev(item, robot, x.expression_id as string, i+1))) return false;
  const rows = x.revisions as CatalogRevision[];
  for (let i=0; i<rows.length; i++) {
    const record = rows[i];
    if (i === 0 && record.previous_record_sha256 !== null) return false;
    if (i > 0 && record.previous_record_sha256 === null) return false;
    if (record.action === 'approve') {
      if (record.source_proposal_id === null || record.rollback_source_revision !== null) return false;
    } else {
      const ref = record.rollback_source_revision;
      if (ref === null || ref >= record.revision || record.source_proposal_id !== null) return false;
      if (!deepEqual(record.expression, rows[ref-1].expression)) return false;
    }
  }
  return true;
}
function proposalItem(x: unknown, robot: string, histories: Map<string,CatalogRevision[]>): x is CatalogProposalPreview {
  if (!exact(x, [
    'proposal_id','expression_id','source_kind','status','submitted_at_utc',
    'approval_revision','expression',
  ]) || typeof x.proposal_id !== 'string' || !HEX32.test(x.proposal_id) ||
    !ident(x.expression_id) || (x.source_kind !== 'operator' && x.source_kind !== 'cognitive_proposal') ||
    !['pending','approved','rejected'].includes(x.status as string) ||
    !date(x.submitted_at_utc) || !validExpression(x.expression) ||
    x.expression.expression_id !== x.expression_id || x.expression.origin !== x.source_kind) return false;
  if (x.status !== 'approved') return x.approval_revision === null;
  if (typeof x.approval_revision !== 'number' || !Number.isInteger(x.approval_revision) || x.approval_revision < 1) return false;
  const reference = histories.get(x.expression_id)?.[x.approval_revision - 1];
  return Boolean(reference && reference.action === 'approve' &&
    reference.source_proposal_id === x.proposal_id &&
    reference.robot_id === robot && deepEqual(reference.expression,x.expression));
}
export function parseCatalogSnapshot(input: unknown, expectedRobot: string): CatalogSnapshot {
  if (!exact(input, [
    'schema_version','robot_id','generated_at_utc','export_mode',
    'integrity_validated_during_export','reader_must_not_trust_as_attested',
    'preview_only','hardware_execution_authorized','expressions','proposals',
  ])) throw new Error('Il file non ha il formato di uno snapshot Visual Studio.');
  if (input.schema_version !== 'openrgd.visual.catalog-snapshot.v0.1-candidate' ||
      input.export_mode !== 'manual_read_only_snapshot' ||
      input.integrity_validated_during_export !== true ||
      input.reader_must_not_trust_as_attested !== true ||
      input.preview_only !== true || input.hardware_execution_authorized !== false) {
    throw new Error('Contratto non supportato o autorizzazioni hardware non ammesse.');
  }
  if (!validPreviewRobot(input.robot_id)) throw new Error('Robot ID non valido.');
  if (input.robot_id !== expectedRobot) throw new Error(
    'Snapshot destinato a ' + input.robot_id + '. Seleziona quel robot prima di importarlo.'
  );
  if (!date(input.generated_at_utc)) throw new Error('Timestamp non valido.');
  if (!Array.isArray(input.expressions) || input.expressions.length > 64 ||
      !Array.isArray(input.proposals) || input.proposals.length > 128) {
    throw new Error('Snapshot oltre i limiti del contratto.');
  }
  const seen = new Set<string>();
  const histories = new Map<string,CatalogRevision[]>();
  for (const item of input.expressions) {
    if (!catalogItem(item,input.robot_id)) throw new Error('Storia revisioni incompleta o non valida.');
    if (seen.has(item.expression_id)) throw new Error('ID espressione ripetuto.');
    seen.add(item.expression_id);
    histories.set(item.expression_id,item.revisions);
  }
  const seenProposals = new Set<string>();
  for (const item of input.proposals) {
    if (!proposalItem(item,input.robot_id,histories)) throw new Error('Proposta o riferimento revisione incoerente.');
    if (seenProposals.has(item.proposal_id)) throw new Error('Proposal ID ripetuto.');
    seenProposals.add(item.proposal_id);
  }
  return input as CatalogSnapshot;
}
