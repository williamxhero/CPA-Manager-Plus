import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import { buildAccountRows } from '@/features/accounts/model/accountRows';
import { resolveAccountQuota } from '@/features/accounts/model/accountQuotaSummary';
import { isQuotaRefreshSupportedProvider } from '@/features/authFiles/constants';
import { getQuotaCredentialStoreKey } from '@/utils/quota/credentialScope';
import { getAuthFileSelectionKey } from './credentialStatus';
import {
  collapseOpenCodeGoAuthFileDuplicates,
  OPENCODE_GO_CANONICAL_ID_PATTERN,
} from './openCodeGoAuthFiles';

const canonicalId =
  'opencode-go-key-dbbfb501eb4b76cd7a465c67f626a59e36ed672216e1f3334dbec285ac88c368';
const physicalName = `${canonicalId}.json`;

const makeRow = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  id: canonicalId,
  name: physicalName,
  provider: 'opencode-go',
  auth_index: 'a1de910f80222386',
  ...overrides,
});

describe('collapseOpenCodeGoAuthFileDuplicates', () => {
  it('recognizes the canonical OpenCode Go plugin ID', () => {
    expect(OPENCODE_GO_CANONICAL_ID_PATTERN.test(canonicalId)).toBe(true);
    expect(OPENCODE_GO_CANONICAL_ID_PATTERN.test(`${canonicalId}.json`)).toBe(false);
  });

  it('collapses the observed duplicate and keeps operational fields from both rows', () => {
    const canonical = makeRow({
      success: 318,
      failed: 2,
      recent_requests: [{ success: 1, failed: 0 }],
      status: 'ok',
      quota: { rolling: { percent: 12.4 } },
    });
    const filenameFallback = makeRow({
      id: physicalName,
      success: 0,
      failed: 0,
      recent_requests: [],
      status: '',
      quota: null,
      supports_quota: true,
      quota_provider: 'opencode-go',
      path: `/auth/${physicalName}`,
    });

    const result = collapseOpenCodeGoAuthFileDuplicates([canonical, filenameFallback]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: canonicalId,
        name: physicalName,
        provider: 'opencode-go',
        auth_index: 'a1de910f80222386',
        success: 318,
        failed: 2,
        recent_requests: [{ success: 1, failed: 0 }],
        status: 'ok',
        quota: { rolling: { percent: 12.4 } },
        supports_quota: true,
        quota_provider: 'opencode-go',
        path: `/auth/${physicalName}`,
      })
    );
    expect(getAuthFileSelectionKey(result[0])).toBe(getAuthFileSelectionKey(canonical));
  });

  it('chooses the canonical plugin row regardless of response order', () => {
    const canonical = makeRow({ success: 7, status: 'ok' });
    const filenameFallback = makeRow({ id: physicalName, status: 'stale' });

    const result = collapseOpenCodeGoAuthFileDuplicates([filenameFallback, canonical]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(canonicalId);
    expect(result[0]?.success).toBe(7);
    expect(result[0]?.status).toBe('ok');
  });

  it('does not collapse rows whose auth indexes differ', () => {
    const first = makeRow({ success: 3 });
    const second = makeRow({ id: physicalName, auth_index: 'different-index', success: 4 });

    expect(collapseOpenCodeGoAuthFileDuplicates([first, second])).toEqual([first, second]);
  });

  it('does not collapse non-OpenCode Go rows', () => {
    const codexCanonical = makeRow({ provider: 'codex' });
    const codexFallback = makeRow({ id: physicalName, provider: 'codex' });
    const otherOpenCode = makeRow({ id: 'opencode-go-key-not-a-canonical-id.json' });

    expect(
      collapseOpenCodeGoAuthFileDuplicates([codexCanonical, codexFallback, otherOpenCode])
    ).toEqual([codexCanonical, codexFallback, otherOpenCode]);
  });

  it('keeps quota identity and account refresh behavior after merging live-shaped rows', () => {
    const canonical = makeRow({
      success: 318,
      failed: 2,
      recent_requests: [{ success: 1, failed: 0 }],
    });
    const filenameFallback = makeRow({
      id: physicalName,
      supports_quota: true,
      quota_provider: 'opencode-go',
    });
    const merged = collapseOpenCodeGoAuthFileDuplicates([canonical, filenameFallback])[0];
    expect(merged).toBeDefined();
    if (!merged) throw new Error('Expected a merged OpenCode Go row');

    const storeKey = getQuotaCredentialStoreKey(merged);
    const stores = {
      antigravityQuota: {},
      claudeQuota: {},
      codexQuota: {},
      devinQuota: {},
      kimiQuota: {},
      metaQuota: {},
      opencodeGoQuota: {
        [storeKey]: {
          status: 'success' as const,
          windows: [
            {
              id: 'rolling',
              label: 'Five hours',
              usedPercent: 12.4,
              resetLabel: '1h',
              resetAtMs: Date.parse('2026-10-06T23:00:00Z'),
            },
          ],
          planType: 'OpenCode Go',
          authFileKey: storeKey,
          authFileName: physicalName,
          authIndex: 'a1de910f80222386',
          authFileIdentityVerified: true,
        },
      },
      xaiQuota: {},
    };

    const rows = buildAccountRows([merged], stores);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) throw new Error('Expected an account row');
    expect(row).toMatchObject({
      provider: 'opencode-go',
      runtimeOnly: false,
      authIndex: 'a1de910f80222386',
      raw: {
        id: canonicalId,
        supports_quota: true,
        quota_provider: 'opencode-go',
      },
    });
    expect(getAuthFileSelectionKey(merged)).toBe(`${physicalName}\u0000a1de910f80222386`);
    expect(storeKey).toBe(`${physicalName}::a1de910f80222386`);
    expect(isQuotaRefreshSupportedProvider(row.provider)).toBe(true);
    expect(resolveAccountQuota(merged, stores)).toMatchObject({
      status: 'ok',
      remainingPercent: 87.6,
      planType: 'OpenCode Go',
    });
  });

  it('does not collapse a legitimate sibling with a different runtime ID', () => {
    const canonical = makeRow();
    const sibling = makeRow({ id: 'opencode-go-runtime-sibling', account: 'other@example.com' });

    expect(collapseOpenCodeGoAuthFileDuplicates([canonical, sibling])).toEqual([
      canonical,
      sibling,
    ]);
  });
});
