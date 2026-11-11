/**
 * Amazon Bedrock draft-model interface: request building only.
 *
 * Amazon Nova may draft caller histories, clue variations and dialogue during
 * episode production (R6.2). This module defines that boundary and refuses any
 * model that is not an Amazon first-party foundation model (R6.1, R6.6). No
 * call is made from here, and nothing in this package invokes Bedrock: the
 * `DraftModelClient` port is implemented by the separate Night Operator
 * content pipeline, behind human approval.
 *
 * The allowlist is a prefix check on the Bedrock model id rather than a list of
 * rejected vendors, so a provider nobody has heard of yet is rejected by
 * default instead of being missed by a blocklist. The same rule is enforced a
 * second time in IAM, where the publication role's `bedrock:InvokeModel`
 * resource is scoped to `amazon.*` foundation models and everything else is
 * explicitly denied.
 */

export const APPROVED_MODEL_ID_PREFIX = 'amazon.nova-';

export type ApprovedModelId = `${typeof APPROVED_MODEL_ID_PREFIX}${string}`;

export function isApprovedModelId(modelId: string): modelId is ApprovedModelId {
  return (
    modelId.startsWith(APPROVED_MODEL_ID_PREFIX) &&
    modelId.length > APPROVED_MODEL_ID_PREFIX.length
  );
}

export class UnapprovedModelError extends Error {
  constructor() {
    super('Only Amazon first-party Nova models may draft episode content.');
    this.name = 'UnapprovedModelError';
  }
}

export function assertApprovedModelId(modelId: string): ApprovedModelId {
  if (!isApprovedModelId(modelId)) {
    throw new UnapprovedModelError();
  }
  return modelId;
}

export type DraftTaskKind =
  | 'caller-history'
  | 'clue-variation'
  | 'dialogue-line'
  | 'critique';

export interface DraftRequest {
  readonly modelId: ApprovedModelId;
  readonly taskKind: DraftTaskKind;
  /** Reviewed instruction text held in the content pipeline, not user input. */
  readonly instruction: string;
  readonly maxOutputTokens: number;
  /** Zero temperature plus an explicit seed keeps a draft reproducible. */
  readonly temperature: 0;
  readonly seed: number;
}

export interface DraftResult {
  readonly text: string;
  readonly modelId: ApprovedModelId;
  readonly seed: number;
}

export interface DraftModelClient {
  draft(request: DraftRequest): Promise<DraftResult>;
}

export interface DraftRequestOptions {
  readonly modelId: string;
  readonly taskKind: DraftTaskKind;
  readonly instruction: string;
  readonly seed: number;
  readonly maxOutputTokens?: number | undefined;
}

const MAX_OUTPUT_TOKENS = 1_024;

export function buildDraftRequest(options: DraftRequestOptions): DraftRequest {
  const modelId = assertApprovedModelId(options.modelId);
  const requested = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  return {
    modelId,
    taskKind: options.taskKind,
    instruction: options.instruction,
    maxOutputTokens: Math.min(Math.max(requested, 1), MAX_OUTPUT_TOKENS),
    temperature: 0,
    seed: options.seed,
  };
}
