import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getRaw: vi.fn(),
  postForm: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('./client', () => ({
  apiClient: mocks,
  createScopedApiRequestConfig: (scope: { apiBase: string; managementKey: string }) => ({
    baseURL: `${scope.apiBase.replace(/\/+$/, '')}/v0/management`,
    headers: { Authorization: `Bearer ${scope.managementKey}` },
    cpampScopedRequest: true,
  }),
}));

import {
  applyAuthFileFieldsPatchToRecord,
  authFilesApi,
  AUTH_FILE_PLAN_DUPLICATE,
  AUTH_FILE_PLAN_SAVE_UNVERIFIED,
  AUTH_FILE_PLAN_SOURCE_CHANGED,
  AUTH_FILE_PLAN_UNSAFE_IDENTITY,
  type AuthFileFieldsPatch,
  type AuthFileStatusTarget,
} from './authFiles';
import { sha256RawTextHex } from '@/utils/apiKeyHash';
import { getPlanCredentialDefaultBaseUrl } from '@/utils/planCredentials';

// All credentials and endpoints are synthetic; every API transport is mocked.
const originalKey = 'synthetic-original-key';
const replacementKey = 'synthetic-replacement-key';
const baseUrl = 'https://plan.example.test/v1';
const recordFor = (provider = 'qwen'): Record<string, unknown> => ({
  type: provider,
  id: `${provider}-key-${sha256RawTextHex(`${originalKey}\u0000${baseUrl}`)}`,
  label: 'Original alias',
  api_key: originalKey,
  base_url: baseUrl,
  disabled: true,
  priority: 4,
  headers: { 'X-Keep': 'retained' },
  opaque: { nested: ['metadata', 17] },
});
const targetFor = (provider = 'qwen'): AuthFileStatusTarget => ({
  name: `${provider}-manual.json`,
  runtimeId: `${provider}-manual.json`,
  authIndex: 'synthetic-index',
  provider,
});
const canonicalTargetFor = (provider: string): AuthFileStatusTarget => ({
  ...targetFor(provider),
  name: `${recordFor(provider).id}.json`,
  runtimeId: `${recordFor(provider).id}.json`,
});
const listEntry = (target: AuthFileStatusTarget) => ({
  name: target.name,
  id: target.runtimeId,
  auth_index: target.authIndex,
  provider: target.provider,
});
let storedText: string;
let uploadedRecord: Record<string, unknown> | undefined;

const setupSource = (record = recordFor(), target = targetFor()) => {
  storedText = ` \n${JSON.stringify(record, null, 2)}\n`;
  mocks.get.mockResolvedValue({ files: [listEntry(target)] });
  mocks.getRaw.mockImplementation(async () => ({ data: new Blob([storedText]) }));
  mocks.postForm.mockImplementation(async (_url: string, data: FormData) => {
    storedText = await (data.get('file') as File).text();
    uploadedRecord = JSON.parse(storedText) as Record<string, unknown>;
    return { status: 'ok', uploaded: 1 };
  });
};
const save = (
  fields: AuthFileFieldsPatch = { api_key: replacementKey, label: 'Updated alias' },
  expected = recordFor(),
  target = targetFor()
) => authFilesApi.savePlanCredentialConfiguration(target, [target], fields, expected);

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  uploadedRecord = undefined;
  setupSource();
});

const expectNoMutation = () => {
  expect(mocks.postForm).not.toHaveBeenCalled();
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
};

describe('plan credential configuration source upload', () => {
  it('maps label and key independently of the selector name without mutating the input', () => {
    const original: Record<string, unknown> = { ...recordFor(), name: 'physical-name.json' };
    const next = applyAuthFileFieldsPatchToRecord(original, {
      label: ' New alias ',
      api_key: ` ${replacementKey} `,
    });
    expect(next.label).toBe('New alias');
    expect(next.api_key).toBe(replacementKey);
    expect(next.name).toBe('physical-name.json');
    expect(original.label).toBe('Original alias');
    expect(applyAuthFileFieldsPatchToRecord(next, { label: ' ' })).not.toHaveProperty('label');
  });

  it.each(['qwen', 'opencode-go'])(
    'uploads and verifies key, label, base and routing for %s',
    async (provider) => {
      const record = recordFor(provider);
      const target = targetFor(provider);
      setupSource(record, target);
      const rawText = storedText;
      const fields: AuthFileFieldsPatch = {
        api_key: replacementKey,
        label: ' Updated alias ',
        base_url: 'https://changed.example.test/v1/',
        proxy_url: 'http://proxy.example.test',
        priority: 8,
        headers: { 'X-New': 'added' },
      };
      const saved = await save(fields, record, target);
      expect(saved).toEqual({
        ...record,
        api_key: replacementKey,
        label: 'Updated alias',
        base_url: 'https://changed.example.test/v1',
        proxy_url: 'http://proxy.example.test',
        priority: 8,
        headers: { 'X-Keep': 'retained', 'X-New': 'added' },
      });
      expect(mocks.patch).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
      const [endpoint, data, config] = mocks.postForm.mock.calls[0];
      expect(endpoint).toBe('/auth-files');
      expect((data.get('file') as File).name).toBe(target.name);
      expect(config.headers['X-CPAMP-Auth-File-Write-Content-SHA256']).toBe(
        sha256RawTextHex(rawText)
      );
      expect(
        JSON.parse(decodeURIComponent(config.headers['X-CPAMP-Auth-File-Write-Identities']))
      ).toEqual([target]);
    }
  );

  it.each(['qwen', 'opencode-go'])(
    'writes an explicit effective default for an empty %s URL',
    async (provider) => {
      setupSource(recordFor(provider), targetFor(provider));
      const saved = await save({ base_url: ' ' }, recordFor(provider), targetFor(provider));
      expect(saved.base_url).toBe(getPlanCredentialDefaultBaseUrl(provider));
      expect(saved.id).toBe(recordFor(provider).id);
    }
  );

  it.each(['qwen', 'opencode-go'])(
    'rejects key rotation on the canonical %s pair-derived filename',
    async (provider) => {
      const record = recordFor(provider);
      const target = canonicalTargetFor(provider);
      setupSource(record, target);
      await expect(save({ api_key: replacementKey }, record, target)).rejects.toThrow(
        AUTH_FILE_PLAN_UNSAFE_IDENTITY
      );
      expectNoMutation();
    }
  );

  it.each(['qwen', 'opencode-go'])(
    'rejects URL rotation on the canonical %s pair-derived filename',
    async (provider) => {
      const record = recordFor(provider);
      const target = canonicalTargetFor(provider);
      setupSource(record, target);
      await expect(
        save({ base_url: 'https://rotated.example.test/v1' }, record, target)
      ).rejects.toThrow(AUTH_FILE_PLAN_UNSAFE_IDENTITY);
      expectNoMutation();
    }
  );

  it.each(['qwen', 'opencode-go'])(
    'allows alias-only edits on canonical %s filenames and retains id',
    async (provider) => {
      const record = recordFor(provider);
      const target = canonicalTargetFor(provider);
      setupSource(record, target);
      expect(await save({ label: 'Safe alias edit' }, record, target)).toEqual({
        ...record,
        label: 'Safe alias edit',
      });
      expect((mocks.postForm.mock.calls[0][1].get('file') as File).name).toBe(target.name);
    }
  );

  it.each(['qwen', 'opencode-go'])(
    'allows an equivalent trailing-slash URL on canonical %s filenames',
    async (provider) => {
      const record = recordFor(provider);
      const target = canonicalTargetFor(provider);
      setupSource(record, target);
      expect(await save({ api_key: originalKey, base_url: `${baseUrl}/` }, record, target)).toEqual(
        record
      );
    }
  );

  it('accepts the exact API-key account snapshot exposed by the CPA runtime list', async () => {
    const target = { ...targetFor(), accountSnapshot: originalKey };
    setupSource(recordFor(), target);
    mocks.get.mockResolvedValue({ files: [{ ...listEntry(target), account: originalKey }] });
    expect((await save({ api_key: replacementKey }, recordFor(), target)).api_key).toBe(
      replacementKey
    );
  });

  it('rejects a runtime account snapshot that does not match the source key', async () => {
    const target = { ...targetFor(), accountSnapshot: 'different-synthetic-account' };
    setupSource(recordFor(), target);
    mocks.get.mockResolvedValue({
      files: [{ ...listEntry(target), account: target.accountSnapshot }],
    });
    await expect(save({}, recordFor(), target)).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
    expectNoMutation();
  });

  it('retains original id, filename, key, URL, disabled status and unrelated metadata for alias-only edits', async () => {
    const saved = await save({ label: 'Alias only' });
    expect(saved).toEqual({ ...recordFor(), label: 'Alias only' });
    expect((mocks.postForm.mock.calls[0][1].get('file') as File).name).toBe(targetFor().name);
  });

  it.each(['', '   '])('retains the key for a blank password patch (case %#)', async (api_key) => {
    expect((await save({ api_key, label: 'Alias only' })).api_key).toBe(originalKey);
  });

  it('rejects an empty stored key even when a blank patch requests retention', async () => {
    const record = { ...recordFor(), api_key: '' };
    setupSource(record);
    await expect(save({ api_key: '' }, record)).rejects.toThrow(AUTH_FILE_PLAN_UNSAFE_IDENTITY);
    expectNoMutation();
  });

  it('merges the patch into freshly downloaded concurrent unrelated metadata', async () => {
    const fresh = {
      ...recordFor(),
      opaque: { newlyAdded: true },
      weight: 3,
      note: 'concurrent note',
    };
    setupSource(fresh);
    expect(await save({ label: 'Renamed' })).toEqual({ ...fresh, label: 'Renamed' });
  });

  it.each(['id', 'type', 'label', 'api_key', 'base_url', 'auth_index', 'account_id'])(
    'rejects stale relevant source field %s before writing',
    async (key) => {
      const expected = { ...recordFor(), [key]: 'stale-value' };
      await expect(save(undefined, expected)).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
      expectNoMutation();
    }
  );

  it('rejects arrays even if they contain a single record', async () => {
    storedText = JSON.stringify([recordFor()]);
    await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
    expectNoMutation();
  });

  it.each(['qwen', 'opencode-go'])(
    'rejects legacy no-URL and configured key-only IDs for %s',
    async (provider) => {
      const record = recordFor(provider);
      delete record.base_url;
      setupSource(record, targetFor(provider));
      await expect(save({}, record, targetFor(provider))).rejects.toThrow(
        AUTH_FILE_PLAN_UNSAFE_IDENTITY
      );
      expectNoMutation();
      record.base_url = baseUrl;
      record.id = `${provider}-key-${sha256RawTextHex(originalKey)}`;
      setupSource(record, targetFor(provider));
      await expect(save({}, record, targetFor(provider))).rejects.toThrow(
        AUTH_FILE_PLAN_UNSAFE_IDENTITY
      );
      expectNoMutation();
    }
  );

  it.each(['virtual-runtime-id', 'MixedCase.json'])(
    'rejects unsafe runtime identity %s',
    async (identity) => {
      const target = { ...targetFor(), runtimeId: identity };
      if (identity.endsWith('.json')) target.name = identity;
      await expect(save({}, recordFor(), target)).rejects.toThrow(AUTH_FILE_PLAN_UNSAFE_IDENTITY);
      expectNoMutation();
    }
  );

  it('requires exactly one matching source identity', async () => {
    const target = targetFor();
    for (const identities of [[], [target, target], [{ ...target, authIndex: 'other-index' }]]) {
      await expect(
        authFilesApi.savePlanCredentialConfiguration(target, identities, {}, recordFor())
      ).rejects.toThrow(AUTH_FILE_PLAN_UNSAFE_IDENTITY);
    }
    expectNoMutation();
  });

  it('rejects unsupported providers', async () => {
    const target = targetFor('codex');
    await expect(save({}, recordFor('codex'), target)).rejects.toThrow(
      AUTH_FILE_PLAN_UNSAFE_IDENTITY
    );
    expectNoMutation();
  });

  it.each([
    { api_key: 'synthetic key' },
    { api_key: 'synthetic\nkey' },
    { base_url: '/relative' },
    { base_url: 'https://user:pass@example.test/v1' },
    { base_url: 'https://example.test/v1?secret=synthetic' },
    { base_url: `https://example.test/${originalKey}` },
  ])(
    'rejects invalid effective key or URL without exposing the input (case %#)',
    async (fields) => {
      await expect(save(fields)).rejects.toThrow(AUTH_FILE_PLAN_UNSAFE_IDENTITY);
      expectNoMutation();
    }
  );

  it('does not fabricate success when an upload silently ignores edited fields', async () => {
    mocks.postForm.mockResolvedValue({ status: 'ok', uploaded: 1 });
    await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_SAVE_UNVERIFIED);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it.each(['id', 'base_url', 'label', 'api_key', 'priority'])(
    'verifies persisted %s after upload',
    async (key) => {
      mocks.postForm.mockImplementation(async (_url: string, data: FormData) => {
        const next = JSON.parse(await (data.get('file') as File).text());
        next[key] = 'not-persisted';
        storedText = JSON.stringify(next);
        return { status: 'ok', uploaded: 1 };
      });
      await expect(
        save({ api_key: replacementKey, label: 'Updated', priority: 8 })
      ).rejects.toThrow(AUTH_FILE_PLAN_SAVE_UNVERIFIED);
      expect(mocks.delete).not.toHaveBeenCalled();
    }
  );

  it('reports dropped unrelated metadata as unverified', async () => {
    mocks.postForm.mockImplementation(async (_url: string, data: FormData) => {
      const next = JSON.parse(await (data.get('file') as File).text());
      delete next.opaque;
      storedText = JSON.stringify(next);
      return { status: 'ok', uploaded: 1 };
    });
    await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_SAVE_UNVERIFIED);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('accepts extra host properties without overlooking retained source fields', async () => {
    mocks.postForm.mockImplementation(async (_url: string, data: FormData) => {
      const next = JSON.parse(await (data.get('file') as File).text());
      next.host_revision = 12;
      storedText = JSON.stringify(next);
      return { status: 'ok', uploaded: 1 };
    });
    expect(await save()).toEqual({
      ...recordFor(),
      api_key: replacementKey,
      label: 'Updated alias',
      host_revision: 12,
    });
  });

  it('checks removed fields and merged routing headers in the read-back', async () => {
    const record = { ...recordFor(), note: 'remove me', proxyUrl: 'legacy-proxy' };
    setupSource(record);
    const saved = await save({ note: '', proxyUrl: null, headers: { 'X-Keep': '' } }, record);
    expect(saved).not.toHaveProperty('note');
    expect(saved).not.toHaveProperty('proxyUrl');
    expect(saved).not.toHaveProperty('headers');
  });
});

describe('plan duplicate preflight, scope and failure safety', () => {
  const addOtherSource = (
    otherRecord: Record<string, unknown>,
    otherTarget = {
      ...targetFor(),
      name: 'other-plan.json',
      runtimeId: 'other-plan.json',
      authIndex: 'other-index',
    }
  ) => {
    mocks.get.mockResolvedValue({ files: [listEntry(targetFor()), listEntry(otherTarget)] });
    mocks.getRaw.mockImplementation(async (url: string) => ({
      data: new Blob([url.includes('other-plan.json') ? JSON.stringify(otherRecord) : storedText]),
    }));
  };

  it('rejects the same key and normalized explicit URL without revealing the key', async () => {
    addOtherSource({ ...recordFor(), api_key: replacementKey, base_url: `${baseUrl}/` });
    await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_DUPLICATE);
    expectNoMutation();
  });

  it('matches duplicate keys using the plugin trim convention', async () => {
    addOtherSource({ ...recordFor(), api_key: ` ${replacementKey} ` });
    await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_DUPLICATE);
    expectNoMutation();
  });

  it('does not assume a configured default for another source with no explicit URL', async () => {
    const other: Record<string, unknown> = { ...recordFor(), api_key: replacementKey };
    delete other.base_url;
    addOtherSource(other);
    expect((await save({ api_key: replacementKey, base_url: '' })).base_url).toBe(
      getPlanCredentialDefaultBaseUrl('qwen')
    );
  });

  it('allows the same key at a different explicit URL', async () => {
    addOtherSource({
      ...recordFor(),
      api_key: replacementKey,
      base_url: 'https://other.example.test/v1',
    });
    await expect(save()).resolves.toHaveProperty('api_key', replacementKey);
  });

  it('downloads only same-provider sources and ignores self only with exact identity', async () => {
    mocks.get.mockResolvedValue({
      files: [listEntry(targetFor()), listEntry(targetFor('opencode-go'))],
    });
    await save({ label: 'Only rename' });
    expect(mocks.getRaw).toHaveBeenCalledTimes(2);
    mocks.postForm.mockClear();
    mocks.get.mockResolvedValue({
      files: [{ ...listEntry(targetFor()), auth_index: 'changed-index' }],
    });
    await expect(save({}, uploadedRecord!)).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
    expectNoMutation();
  });

  it('rejects expanded or missing current source identities', async () => {
    for (const files of [
      [],
      [listEntry(targetFor()), { ...listEntry(targetFor()), auth_index: 'other-index' }],
    ]) {
      mocks.get.mockResolvedValue({ files });
      await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
      expectNoMutation();
    }
  });

  it('uses the captured authenticated scope for refresh, list, duplicate download, upload and verification', async () => {
    addOtherSource({ ...recordFor(), api_key: 'different-synthetic-key' });
    const scope = {
      apiBase: 'https://captured.example.test',
      managementKey: 'synthetic-management-key',
    };
    await authFilesApi.savePlanCredentialConfiguration(
      targetFor(),
      [targetFor()],
      {},
      recordFor(),
      scope
    );
    const scopedConfig = {
      baseURL: `${scope.apiBase}/v0/management`,
      headers: { Authorization: `Bearer ${scope.managementKey}` },
      cpampScopedRequest: true,
    };
    expect(mocks.get).toHaveBeenCalledWith('/auth-files', scopedConfig);
    expect(mocks.getRaw).toHaveBeenCalledTimes(3);
    for (const [, config] of mocks.getRaw.mock.calls) {
      expect(config).toEqual({ ...scopedConfig, responseType: 'blob' });
    }
    const config = mocks.postForm.mock.calls[0][2];
    expect(config).toMatchObject(scopedConfig);
    expect(config.headers['X-CPAMP-Auth-File-Write-Identities']).toBeTypeOf('string');
    expect(config.headers['X-CPAMP-Auth-File-Write-Content-SHA256']).toBeTypeOf('string');
  });

  it('aborts when the target changes while a duplicate-preflight download is in flight', async () => {
    addOtherSource({ ...recordFor(), api_key: 'different-synthetic-key' });
    let current = true;
    const implementation = mocks.getRaw.getMockImplementation()!;
    mocks.getRaw.mockImplementation(async (url: string) => {
      const response = await implementation(url);
      if (url.includes('other-plan.json')) current = false;
      return response;
    });
    await expect(
      authFilesApi.savePlanCredentialConfiguration(
        targetFor(),
        [targetFor()],
        {},
        recordFor(),
        undefined,
        () => current
      )
    ).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
    expectNoMutation();
  });

  it('aborts when the target changes during the inventory await', async () => {
    let current = true;
    mocks.get.mockImplementation(async () => {
      current = false;
      return { files: [listEntry(targetFor())] };
    });
    await expect(
      authFilesApi.savePlanCredentialConfiguration(
        targetFor(),
        [targetFor()],
        {},
        recordFor(),
        undefined,
        () => current
      )
    ).rejects.toThrow(AUTH_FILE_PLAN_SOURCE_CHANGED);
    expectNoMutation();
  });

  it.each(['initial-read', 'inventory', 'duplicate-read', 'upload', 'verification'])(
    'sanitizes %s transport failures and never deletes the original',
    async (stage) => {
      const rawError = new Error(`upstream private details ${originalKey} ${replacementKey}`);
      const expectedCode = ['upload', 'verification'].includes(stage)
        ? AUTH_FILE_PLAN_SAVE_UNVERIFIED
        : AUTH_FILE_PLAN_SOURCE_CHANGED;
      if (stage === 'initial-read') mocks.getRaw.mockRejectedValue(rawError);
      if (stage === 'inventory') mocks.get.mockRejectedValue(rawError);
      if (stage === 'duplicate-read') {
        addOtherSource({ ...recordFor(), api_key: replacementKey });
        mocks.getRaw
          .mockResolvedValueOnce({ data: new Blob([storedText]) })
          .mockRejectedValueOnce(rawError);
      }
      if (stage === 'upload') mocks.postForm.mockRejectedValue(rawError);
      if (stage === 'verification') {
        mocks.getRaw
          .mockResolvedValueOnce({ data: new Blob([storedText]) })
          .mockRejectedValueOnce(rawError);
      }
      const error = await save().catch((err: Error) => err);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(expectedCode);
      expect((error as Error).message).not.toContain(originalKey);
      expect((error as Error).message).not.toContain(replacementKey);
      expect(error).not.toHaveProperty('cause');
      expect(mocks.delete).not.toHaveBeenCalled();
      if (stage === 'verification') expect(uploadedRecord?.api_key).toBe(replacementKey);
    }
  );

  it('sanitizes upload failure response messages and retains the original', async () => {
    mocks.postForm.mockResolvedValue({
      status: 'error',
      uploaded: 0,
      failed: [{ name: targetFor().name, error: `private ${replacementKey}` }],
    });
    await expect(save()).rejects.toThrow(AUTH_FILE_PLAN_SAVE_UNVERIFIED);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
