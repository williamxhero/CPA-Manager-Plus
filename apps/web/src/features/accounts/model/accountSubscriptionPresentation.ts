import type { TFunction } from 'i18next';
import type { ClaudeQuotaState, CodexQuotaState } from '@/types';
import { isValidQuotaResetAtMs } from '@/utils/quota/formatters';
import { normalizeStringValue, parseIdTokenPayload } from '@/utils/quota/parsers';
import { parseTimestampMs } from '@/utils/timestamp';
import { getPlanPresentation, resolveAuthFilePlanType, type PlanPresentation } from '@/utils/plans';
import type { AccountRow } from './accountRows';

export interface AccountSubscriptionPresentation {
  effectivePlanType: string | null;
  planPresentation: PlanPresentation | null;
  isPaidCodex: boolean;
  liveSubscriptionUntilMs: number | null;
  tokenSubscriptionUntilMs: number | null;
  subscriptionUntilMs: number | null;
  subscriptionUntilLabelKey: string;
  remainingDays: number | null;
}

/**
 * Codex quota for list-card subscription presentation.
 * Same input `buildAccountRows` uses for `subscriptionUntilMs` when AccountsPage
 * passes `accountQuotaOverrides`: display/override quota only, including `undefined`
 * when the override map omits the key. Never the live store quota.
 */
export const resolveAccountListSubscriptionQuota = (input: {
  provider: string;
  displayCodexQuota?: CodexQuotaState | null;
}): CodexQuotaState | null | undefined => {
  if (input.provider !== 'codex') return undefined;
  return input.displayCodexQuota;
};

export const parseValidSubscriptionUntilMs = (value: unknown): number | null => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
        ? Number(value.trim())
        : null;
  const parsed =
    numeric !== null && Number.isFinite(numeric)
      ? numeric < 1e12
        ? numeric * 1000
        : numeric
      : parseTimestampMs(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number.isNaN(new Date(parsed).getTime()) ? null : parsed;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const resolveCodexSubscriptionUntilMs = (
  row: Pick<AccountRow, 'provider' | 'raw'>,
  codexQuota?: CodexQuotaState | null
): {
  liveSubscriptionUntilMs: number | null;
  tokenSubscriptionUntilMs: number | null;
  subscriptionUntilMs: number | null;
} => {
  if (row.provider !== 'codex') {
    return {
      liveSubscriptionUntilMs: null,
      tokenSubscriptionUntilMs: null,
      subscriptionUntilMs: null,
    };
  }

  const liveSubscriptionUntilMs = parseValidSubscriptionUntilMs(
    codexQuota?.subscriptionActiveUntil
  );

  const metadata = asRecord(row.raw.metadata);
  const attributes = asRecord(row.raw.attributes);
  const tokenSubscriptionUntilMs = [
    row.raw.id_token,
    metadata?.id_token,
    attributes?.id_token,
  ].reduce<number | null>((resolved, candidate) => {
    if (resolved !== null) return resolved;
    const payload = parseIdTokenPayload(candidate);
    return parseValidSubscriptionUntilMs(
      payload?.chatgpt_subscription_active_until ?? payload?.chatgptSubscriptionActiveUntil
    );
  }, null);

  const subscriptionUntilMs = liveSubscriptionUntilMs ?? tokenSubscriptionUntilMs;

  return {
    liveSubscriptionUntilMs,
    tokenSubscriptionUntilMs,
    subscriptionUntilMs,
  };
};

export const buildAccountSubscriptionPresentation = (input: {
  row: Pick<AccountRow, 'provider' | 'planType' | 'raw'>;
  codexQuota?: CodexQuotaState | null;
  opencodeGoQuota?: ClaudeQuotaState | null;
  t?: TFunction;
  nowMs?: number;
}): AccountSubscriptionPresentation => {
  const { row, codexQuota, opencodeGoQuota, t, nowMs = Date.now() } = input;
  const effectivePlanType = normalizeStringValue(
    codexQuota?.planType ?? row.planType ?? resolveAuthFilePlanType(row.raw)
  );
  const planPresentation = getPlanPresentation({
    provider: row.provider,
    planType: effectivePlanType,
    t,
  });

  const isPaidCodex =
    row.provider === 'codex' &&
    effectivePlanType !== null &&
    planPresentation?.canonicalPlanType !== 'free';

  let liveSubscriptionUntilMs: number | null = null;
  let tokenSubscriptionUntilMs: number | null = null;
  let subscriptionUntilMs: number | null = null;

  if (isPaidCodex) {
    const resolved = resolveCodexSubscriptionUntilMs(row, codexQuota);
    liveSubscriptionUntilMs = resolved.liveSubscriptionUntilMs;
    tokenSubscriptionUntilMs = resolved.tokenSubscriptionUntilMs;
    subscriptionUntilMs = resolved.subscriptionUntilMs;
  } else if (row.provider === 'opencode-go') {
    // Go's monthly reset is the plan boundary; rolling and weekly resets are not.
    const resetAtMs = opencodeGoQuota?.windows.find((window) => window.id === 'monthly')?.resetAtMs;
    liveSubscriptionUntilMs = isValidQuotaResetAtMs(resetAtMs) ? resetAtMs : null;
    subscriptionUntilMs = liveSubscriptionUntilMs;
  }

  const subscriptionUntilLabelKey =
    liveSubscriptionUntilMs !== null
      ? 'accounts.detail_subscription_until'
      : 'accounts.detail_subscription_until_token';

  const remainingDays =
    subscriptionUntilMs !== null && subscriptionUntilMs > nowMs
      ? Math.max(1, Math.ceil((subscriptionUntilMs - nowMs) / 86400000))
      : null;

  return {
    effectivePlanType,
    planPresentation,
    isPaidCodex,
    liveSubscriptionUntilMs,
    tokenSubscriptionUntilMs,
    subscriptionUntilMs,
    subscriptionUntilLabelKey,
    remainingDays,
  };
};
