import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { AuthFilesApiRequestScope } from '@/services/api';
import {
  useAuthFileConfigurationEditor,
  type UseAuthFileConfigurationEditorResult,
} from './useAuthFileConfigurationEditor';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const { mocks } = vi.hoisted(() => ({
  mocks: {
    downloadText: vi.fn(),
    list: vi.fn(),
    lookup: vi.fn(),
    patchFieldsWithPluginSourceFallback: vi.fn(),
    patchFieldsForAuthIndexes: vi.fn(),
    savePlanCredentialConfiguration: vi.fn(),
    showNotification: vi.fn(),
    reconcileSource: vi.fn(async (_name?: string): Promise<void> => undefined),
    onSaved: vi.fn(),
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mocks.t,
  }),
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    authFilesApi: {
      ...actual.authFilesApi,
      downloadText: mocks.downloadText,
      list: mocks.list,
      lookup: mocks.lookup,
      patchFieldsWithPluginSourceFallback: mocks.patchFieldsWithPluginSourceFallback,
      patchFieldsForAuthIndexes: mocks.patchFieldsForAuthIndexes,
      savePlanCredentialConfiguration: mocks.savePlanCredentialConfiguration,
    },
  };
});

vi.mock('@/stores', () => ({
  useNotificationStore: (
    selector: (state: { showNotification: typeof mocks.showNotification }) => unknown
  ) => selector({ showNotification: mocks.showNotification }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = {
  name: 'xai.json',
  id: 'runtime-xai-1',
  type: 'xai',
  provider: 'xai',
  authIndex: 'auth-1',
  account: 'xai@example.com',
  account_id: 'account-1',
} as AuthFileItem;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const setDownloadedRecord = (record: Record<string, unknown>) => {
  mocks.downloadText.mockResolvedValue(JSON.stringify(record));
};

describe('useAuthFileConfigurationEditor', () => {
  let renderer: ReactTestRenderer | null = null;
  let latest: UseAuthFileConfigurationEditorResult | null = null;

  function Harness({
    enabled = true,
    activeFile = file,
    connectionKey = 'connection-a',
    sourceMemberCount = 1,
    requestScope,
    disableControls = false,
  }: {
    enabled?: boolean;
    activeFile?: AuthFileItem;
    connectionKey?: string;
    sourceMemberCount?: number;
    requestScope?: AuthFilesApiRequestScope;
    disableControls?: boolean;
  }) {
    const editor = useAuthFileConfigurationEditor({
      file: activeFile,
      enabled,
      disableControls,
      sourceMemberCount,
      connectionKey,
      requestScope,
      reconcileSource: mocks.reconcileSource,
      onSaved: mocks.onSaved,
    });
    useEffect(() => {
      latest = editor;
    }, [editor]);
    return null;
  }

  beforeEach(() => {
    latest = null;
    renderer = null;
    mocks.downloadText.mockReset();
    mocks.list.mockReset();
    mocks.lookup.mockReset();
    mocks.patchFieldsWithPluginSourceFallback.mockReset();
    mocks.patchFieldsForAuthIndexes.mockReset();
    mocks.savePlanCredentialConfiguration.mockReset();
    mocks.showNotification.mockReset();
    mocks.reconcileSource.mockReset();
    mocks.reconcileSource.mockResolvedValue(undefined);
    mocks.onSaved.mockReset();
    mocks.downloadText.mockResolvedValue(
      JSON.stringify({
        type: 'xai',
        auth_index: 'auth-1',
        account_id: 'account-1',
        using_api: false,
        access_token: 'secret-token',
        note: 'old',
      })
    );
    mocks.list.mockResolvedValue({ files: [file] });
    mocks.lookup.mockResolvedValue([file]);
    mocks.patchFieldsWithPluginSourceFallback.mockResolvedValue({ status: 'ok' });
    mocks.patchFieldsForAuthIndexes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  describe.each(['qwen', 'opencode-go'])('%s plan credentials', (provider) => {
    const storedKey = 'test-stored-plan-key-1234';
    const replacementKey = 'test-replacement-plan-key-5678';
    const planFile = {
      name: `${provider}.json`,
      id: `runtime-${provider}-1`,
      type: provider,
      provider,
      authIndex: 'plan-1',
    } as AuthFileItem;
    const storedRecord = {
      type: provider,
      auth_index: 'plan-1',
      api_key: storedKey,
      label: 'Persisted alias',
      base_url: 'https://gateway.example/v1',
      note: 'Saved note',
      quota_snapshot: { remaining: 42 },
      opaque_plugin_metadata: { keep: true },
    };
    const scope: AuthFilesApiRequestScope = {
      apiBase: 'https://cpa-test.example',
      managementKey: 'synthetic-management-key',
    };

    beforeEach(() => {
      mocks.downloadText.mockResolvedValue(JSON.stringify(storedRecord));
      mocks.lookup.mockResolvedValue([planFile]);
      mocks.savePlanCredentialConfiguration.mockResolvedValue(storedRecord);
    });

    const mountPlan = async (props: Partial<Parameters<typeof Harness>[0]> = {}) => {
      await act(async () => {
        renderer = create(<Harness activeFile={planFile} {...props} />);
        await Promise.resolve();
      });
      await flush();
    };

    it('initializes from the actual scoped download rather than list metadata', async () => {
      await mountPlan({ requestScope: scope });
      expect(mocks.downloadText).toHaveBeenCalledExactlyOnceWith(planFile.name, scope);
      expect(mocks.list).not.toHaveBeenCalled();
      expect(latest?.state?.record).toEqual(storedRecord);
      expect(latest?.draft).toMatchObject({
        alias: 'Persisted alias',
        apiKey: '',
        baseUrl: storedRecord.base_url,
      });
      expect(latest?.rawDataText).toContain('"api_key": "[redacted]"');
      expect(latest?.rawDataText).not.toContain(storedKey);
      expect(latest?.dirty).toBe(false);
    });

    it.each(['alias', 'apiKey', 'baseUrl'] as const)(
      'routes a %s patch through the verified helper and uses its persisted record',
      async (field) => {
        await mountPlan({ requestScope: scope });
        const value =
          field === 'alias'
            ? 'Edited alias'
            : field === 'apiKey'
              ? replacementKey
              : 'https://new-gateway.example/v1';
        act(() => latest?.updateField(field, value));
        const expectedPatch =
          field === 'alias'
            ? { label: value, base_url: storedRecord.base_url }
            : field === 'apiKey'
              ? { label: storedRecord.label, api_key: value, base_url: storedRecord.base_url }
              : { base_url: value };
        const persisted = {
          ...storedRecord,
          ...expectedPatch,
          opaque_plugin_metadata: { keep: true, verified: true },
        };
        mocks.savePlanCredentialConfiguration.mockResolvedValueOnce(persisted);
        await act(async () => {
          await latest?.save();
        });

        expect(mocks.savePlanCredentialConfiguration).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            name: planFile.name,
            runtimeId: planFile.id,
            authIndex: 'plan-1',
          }),
          [expect.objectContaining({ name: planFile.name, authIndex: 'plan-1' })],
          expectedPatch,
          storedRecord,
          scope,
          expect.any(Function)
        );
        const guard = mocks.savePlanCredentialConfiguration.mock.calls[0][5] as () => boolean;
        expect(guard()).toBe(true);
        expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
        expect(mocks.patchFieldsForAuthIndexes).not.toHaveBeenCalled();
        expect(mocks.downloadText).toHaveBeenCalledTimes(1);
        expect(latest?.state?.record).toEqual(persisted);
        expect(latest?.draft?.apiKey).toBe('');
        expect(latest?.dirty).toBe(false);
        expect(latest?.rawDataText).not.toContain(storedKey);
        expect(latest?.rawDataText).not.toContain(replacementKey);
        expect(latest?.rawDataText).toContain('"verified": true');
        expect(mocks.reconcileSource).toHaveBeenCalledWith(planFile.name);
        expect(mocks.onSaved).toHaveBeenCalledWith(planFile.name);
        expect(mocks.showNotification).toHaveBeenCalledExactlyOnceWith(
          'accounts.config_plan_saved_success',
          'success'
        );
      }
    );

    it.each([false, true])(
      'saves again after key rotation without reopening (parent snapshot refreshed: %s)',
      async (refreshParentSnapshot) => {
        const originalFile = { ...planFile, account: storedKey };
        mocks.lookup.mockResolvedValue([originalFile]);
        await mountPlan({ activeFile: originalFile, requestScope: scope });
        const rotatedRecord = { ...storedRecord, api_key: replacementKey };
        mocks.savePlanCredentialConfiguration.mockResolvedValueOnce(rotatedRecord);
        act(() => latest?.updateField('apiKey', replacementKey));
        await act(async () => {
          await latest?.save();
        });

        expect(mocks.savePlanCredentialConfiguration).toHaveBeenCalledTimes(1);
        expect(latest?.state?.authFile.account).toBe(replacementKey);
        expect(latest?.state?.record).toEqual(rotatedRecord);
        expect(latest?.draft?.apiKey).toBe('');
        expect(latest?.dirty).toBe(false);

        const currentFile = { ...originalFile, account: replacementKey };
        mocks.lookup.mockResolvedValue([currentFile]);
        mocks.list.mockResolvedValue({ files: [currentFile] });
        mocks.lookup.mockClear();
        if (refreshParentSnapshot) {
          await act(async () => {
            renderer?.update(<Harness activeFile={currentFile} requestScope={scope} />);
            await Promise.resolve();
          });
          await flush();
        }
        expect(mocks.downloadText).toHaveBeenCalledTimes(1);
        act(() => latest?.updateField('alias', 'Alias after rotation'));
        const savedAgain = { ...rotatedRecord, label: 'Alias after rotation' };
        mocks.savePlanCredentialConfiguration.mockResolvedValueOnce(savedAgain);
        await act(async () => {
          await latest?.save();
        });

        expect(mocks.lookup).toHaveBeenCalledWith({ name: planFile.name }, scope);
        expect(mocks.lookup).toHaveBeenCalledWith({ name: planFile.id }, scope);
        expect(mocks.savePlanCredentialConfiguration).toHaveBeenCalledTimes(2);
        expect(mocks.savePlanCredentialConfiguration).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            name: planFile.name,
            runtimeId: planFile.id,
            authIndex: 'plan-1',
            accountSnapshot: replacementKey,
          }),
          [expect.objectContaining({ authIndex: 'plan-1', accountSnapshot: replacementKey })],
          { label: 'Alias after rotation', base_url: storedRecord.base_url },
          rotatedRecord,
          scope,
          expect.any(Function)
        );
        expect(mocks.downloadText).toHaveBeenCalledTimes(1);
        expect(mocks.list).not.toHaveBeenCalled();
        expect(latest?.state?.record).toEqual(savedAgain);
        expect(latest?.draft?.alias).toBe('Alias after rotation');
        expect(latest?.draft?.apiKey).toBe('');
        expect(latest?.dirty).toBe(false);
        expect(latest?.rawDataText).not.toContain(storedKey);
        expect(latest?.rawDataText).not.toContain(replacementKey);
        expect(mocks.onSaved).toHaveBeenCalledTimes(2);
        expect(mocks.showNotification.mock.calls).toEqual([
          ['accounts.config_plan_saved_success', 'success'],
          ['accounts.config_plan_saved_success', 'success'],
        ]);
      }
    );

    it('keeps common-only edits on the existing patch route', async () => {
      await mountPlan();
      act(() => latest?.updateField('note', 'Edited note'));
      mocks.downloadText.mockResolvedValue(
        JSON.stringify({ ...storedRecord, note: 'Edited note' })
      );
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
      expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledWith(
        expect.objectContaining({ name: planFile.name }),
        { note: 'Edited note' },
        [expect.objectContaining({ name: planFile.name })]
      );
      expect(mocks.showNotification).toHaveBeenCalledWith(
        'accounts.config_saved_success',
        'success'
      );
    });

    it('retains a blank key and resets replacements without any mutation', async () => {
      await mountPlan();
      act(() => latest?.updateField('apiKey', '   '));
      expect(latest?.dirty).toBe(false);
      await act(async () => {
        await latest?.save();
      });
      act(() => {
        latest?.updateField('apiKey', replacementKey);
        latest?.updateField('alias', 'Unsaved alias');
      });
      expect(latest?.dirty).toBe(true);
      act(() => latest?.reset());
      expect(latest?.draft).toMatchObject({ alias: storedRecord.label, apiKey: '' });
      expect(latest?.dirty).toBe(false);
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
      expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
    });

    it('cancels unsaved replacements on unmount without any mutation', async () => {
      await mountPlan();
      act(() => latest?.updateField('apiKey', replacementKey));
      act(() => renderer?.unmount());
      renderer = null;
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
    });

    it.each([
      ['apiKey', 'unsafe key', 'accounts.config_error_plan_api_key'],
      [
        'baseUrl',
        'https://user:password@gateway.example/v1',
        'accounts.config_error_plan_base_url',
      ],
    ] as const)('blocks invalid %s before preflight or mutation', async (field, value, error) => {
      await mountPlan();
      act(() => latest?.updateField(field, value));
      expect(latest?.dirty).toBe(true);
      expect(latest?.canSave).toBe(false);
      expect(latest?.errors[field]).toBe(error);
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
    });

    it('keeps a shared single-object plan source read-only', async () => {
      await mountPlan({ sourceMemberCount: 2 });
      expect(latest?.sharedSourceReadOnly).toBe(true);
      act(() => latest?.updateField('apiKey', replacementKey));
      act(() => latest?.updateField('alias', 'Must not edit'));
      expect(latest?.draft).toMatchObject({ alias: storedRecord.label, apiKey: '' });
      expect(latest?.canSave).toBe(false);
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
      expect(mocks.lookup).not.toHaveBeenCalled();
    });

    it('passes all shared array identities and the selected original record to the helper', async () => {
      const sibling = { ...planFile, id: `runtime-${provider}-2`, authIndex: 'plan-2' };
      mocks.lookup.mockResolvedValue([planFile, sibling]);
      mocks.downloadText.mockResolvedValue(
        JSON.stringify([
          storedRecord,
          {
            ...storedRecord,
            auth_index: 'plan-2',
            label: 'Sibling alias',
            api_key: replacementKey,
          },
        ])
      );
      await mountPlan({ sourceMemberCount: 2 });
      expect(latest?.sharedSourceReadOnly).toBe(false);
      act(() => latest?.updateField('alias', 'Edited alias'));
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.savePlanCredentialConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({ authIndex: 'plan-1' }),
        [
          expect.objectContaining({ authIndex: 'plan-1' }),
          expect.objectContaining({ authIndex: 'plan-2' }),
        ],
        { label: 'Edited alias', base_url: storedRecord.base_url },
        storedRecord,
        undefined,
        expect.any(Function)
      );
      expect(mocks.downloadText).toHaveBeenCalledTimes(1);
      expect(latest?.state?.recordIndex).toBe(0);
    });

    it.each([
      ['AUTH_FILE_PLAN_DUPLICATE', 'accounts.config_error_plan_duplicate'],
      ['AUTH_FILE_PLAN_SOURCE_CHANGED', 'accounts.config_error_plan_source_changed'],
      ['AUTH_FILE_PLAN_UNSAFE_IDENTITY', 'accounts.config_error_plan_configured'],
      [
        `Raw transport error ${storedKey} https://user:password@example.test/?key=${replacementKey}`,
        'accounts.config_error_plan_save',
      ],
    ])('maps save error %s to a static sanitized message', async (message, translationKey) => {
      await mountPlan();
      mocks.savePlanCredentialConfiguration.mockRejectedValueOnce(new Error(message));
      act(() => latest?.updateField('alias', 'Edited alias'));
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.showNotification).toHaveBeenCalledExactlyOnceWith(
        `notification.update_failed: ${translationKey}`,
        'error'
      );
      expect(latest?.dirty).toBe(true);
      expect(latest?.state?.saving).toBe(false);
      expect(mocks.reconcileSource).not.toHaveBeenCalled();
      expect(mocks.onSaved).not.toHaveBeenCalled();
      expect(JSON.stringify(mocks.showNotification.mock.calls)).not.toContain(storedKey);
      expect(JSON.stringify(mocks.showNotification.mock.calls)).not.toContain(replacementKey);
    });

    it('sanitizes raw download errors before rendering the load failure', async () => {
      mocks.downloadText.mockRejectedValueOnce(new Error(`Transport failed with ${storedKey}`));
      await mountPlan();
      expect(latest?.state?.error).toBe('notification.download_failed');
      expect(latest?.draft).toBeNull();
      expect(latest?.rawDataText).toBe('');
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
    });

    it('sanitizes common patch errors on plan providers too', async () => {
      await mountPlan();
      mocks.patchFieldsWithPluginSourceFallback.mockRejectedValueOnce(
        new Error(`Raw ${storedKey}`)
      );
      act(() => latest?.updateField('note', 'Edited note'));
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.showNotification).toHaveBeenCalledExactlyOnceWith(
        'notification.update_failed: accounts.config_error_plan_save',
        'error'
      );
    });

    it('does not load or mutate when the editor is disabled', async () => {
      await mountPlan({ enabled: false });
      expect(latest?.state).toBeNull();
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.downloadText).not.toHaveBeenCalled();
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
    });

    it('blocks mutation when connection controls are disabled', async () => {
      await mountPlan({ disableControls: true });
      act(() => latest?.updateField('alias', 'Edited alias'));
      expect(latest?.canSave).toBe(false);
      await act(async () => {
        await latest?.save();
      });
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
    });

    it('abandons a pending preflight when connection controls become disabled', async () => {
      const deferred = createDeferred<AuthFileItem[]>();
      await mountPlan();
      mocks.lookup.mockReturnValueOnce(deferred.promise);
      act(() => latest?.updateField('alias', 'Pending alias'));
      let pending!: Promise<void>;
      act(() => {
        pending = latest!.save();
      });
      await flush();
      await act(async () => {
        renderer?.update(<Harness activeFile={planFile} disableControls />);
      });
      await act(async () => {
        deferred.resolve([planFile]);
        await pending;
      });
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
      expect(mocks.showNotification).not.toHaveBeenCalled();
      expect(latest?.state?.saving).toBe(false);
      expect(latest?.draft?.alias).toBe('Pending alias');
    });

    it.each(['connection', 'selection', 'enabled', 'controls'] as const)(
      'invalidates the API guard and suppresses a late response after %s changes',
      async (change) => {
        const deferred = createDeferred<Record<string, unknown>>();
        await mountPlan({ requestScope: scope });
        mocks.savePlanCredentialConfiguration.mockReturnValueOnce(deferred.promise);
        act(() => latest?.updateField('alias', 'Late saved alias'));
        let pending!: Promise<void>;
        act(() => {
          pending = latest!.save();
        });
        await flush();
        expect(mocks.savePlanCredentialConfiguration).toHaveBeenCalledTimes(1);
        const guard = mocks.savePlanCredentialConfiguration.mock.calls[0][5] as () => boolean;
        expect(guard()).toBe(true);

        const nextFile =
          change === 'selection'
            ? {
                ...planFile,
                name: `${provider}-sibling.json`,
                id: `runtime-${provider}-2`,
                authIndex: 'plan-2',
              }
            : planFile;
        mocks.downloadText.mockResolvedValue(
          JSON.stringify({
            ...storedRecord,
            auth_index: nextFile.authIndex,
            label: 'Current alias',
          })
        );
        await act(async () => {
          renderer?.update(
            <Harness
              activeFile={nextFile}
              connectionKey={change === 'connection' ? 'connection-b' : 'connection-a'}
              enabled={change !== 'enabled'}
              disableControls={change === 'controls'}
              requestScope={scope}
            />
          );
          await Promise.resolve();
        });
        await flush();
        expect(guard()).toBe(false);
        await act(async () => {
          deferred.resolve({ ...storedRecord, label: 'Late saved alias' });
          await pending;
        });
        expect(latest?.draft?.alias).toBe(
          change === 'enabled'
            ? undefined
            : change === 'controls'
              ? 'Late saved alias'
              : 'Current alias'
        );
        expect(mocks.reconcileSource).not.toHaveBeenCalled();
        expect(mocks.onSaved).not.toHaveBeenCalled();
        expect(mocks.showNotification).not.toHaveBeenCalled();
      }
    );

    it('does not call the mutation helper after late preflight on an old connection', async () => {
      const deferred = createDeferred<AuthFileItem[]>();
      await mountPlan();
      mocks.lookup.mockReturnValueOnce(deferred.promise);
      act(() => latest?.updateField('alias', 'Old connection alias'));
      let pending!: Promise<void>;
      act(() => {
        pending = latest!.save();
      });
      await flush();
      mocks.downloadText.mockResolvedValue(
        JSON.stringify({ ...storedRecord, label: 'Current alias' })
      );
      await act(async () => {
        renderer?.update(<Harness activeFile={planFile} connectionKey="connection-b" />);
        await Promise.resolve();
      });
      await flush();
      await act(async () => {
        deferred.resolve([planFile]);
        await pending;
      });
      expect(mocks.savePlanCredentialConfiguration).not.toHaveBeenCalled();
      expect(latest?.draft?.alias).toBe('Current alias');
      expect(mocks.showNotification).not.toHaveBeenCalled();
    });

    it('suppresses a late initial download after switching connections', async () => {
      const deferred = createDeferred<string>();
      mocks.downloadText.mockReturnValueOnce(deferred.promise);
      await mountPlan();
      expect(latest?.state?.loading).toBe(true);
      mocks.downloadText.mockResolvedValue(
        JSON.stringify({ ...storedRecord, label: 'Current alias' })
      );
      await act(async () => {
        renderer?.update(<Harness activeFile={planFile} connectionKey="connection-b" />);
        await Promise.resolve();
      });
      await flush();
      await act(async () => {
        deferred.resolve(JSON.stringify({ ...storedRecord, label: `Old ${storedKey}` }));
        await deferred.promise;
      });
      expect(latest?.draft?.alias).toBe('Current alias');
      expect(latest?.draft?.apiKey).toBe('');
      expect(latest?.rawDataText).not.toContain(storedKey);
    });
  });

  it('loads, saves a minimal identity-verified patch, and keeps the editor open', async () => {
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    expect(latest?.state).toMatchObject({
      fileName: 'xai.json',
      loading: false,
      providerKey: 'xai',
    });

    act(() => latest?.updateField('note', 'updated'));
    expect(latest?.dirty).toBe(true);
    expect(latest?.rawDataText).toContain('"note": "old"');
    expect(latest?.rawDataText).not.toContain('updated');
    expect(latest?.rawDataText).toContain('"access_token": "[redacted]"');
    expect(latest?.rawDataText).not.toContain('secret-token');

    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      using_api: false,
      access_token: 'secret-token',
      note: 'updated',
    });

    await act(async () => {
      await latest?.save();
    });

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.lookup).toHaveBeenCalledWith({ name: 'xai.json' });
    expect(mocks.lookup).toHaveBeenCalledWith({ name: 'runtime-xai-1' });
    expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'xai.json',
        runtimeId: 'runtime-xai-1',
        authIndex: 'auth-1',
      }),
      { note: 'updated' },
      [
        expect.objectContaining({
          name: 'xai.json',
          runtimeId: 'runtime-xai-1',
          authIndex: 'auth-1',
        }),
      ]
    );
    expect(mocks.downloadText).toHaveBeenCalledWith('xai.json');
    expect(mocks.reconcileSource).toHaveBeenCalledWith('xai.json');
    expect(mocks.onSaved).toHaveBeenCalledWith('xai.json');
    expect(mocks.showNotification).toHaveBeenCalledWith('accounts.config_saved_success', 'success');
    expect(latest?.state?.record).toMatchObject({ note: 'updated' });
    expect(latest?.rawDataText).toContain('"note": "updated"');
    expect(latest?.dirty).toBe(false);
    expect(renderer).not.toBeNull();
  });

  it.each([
    [undefined, 'enabled', false],
    [true, 'inherit', null],
  ] as const)(
    'saves credential cooling %j -> %s as %j',
    async (initialOverride, nextPolicy, expectedOverride) => {
      mocks.downloadText.mockResolvedValueOnce(
        JSON.stringify({
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          ...(initialOverride === undefined ? {} : { disable_cooling: initialOverride }),
        })
      );
      await act(async () => {
        renderer = create(<Harness />);
        await Promise.resolve();
      });
      await flush();

      act(() => latest?.updateField('disableCooling', nextPolicy));
      setDownloadedRecord({
        type: 'xai',
        auth_index: 'auth-1',
        account_id: 'account-1',
        disable_cooling: expectedOverride,
      });
      await act(async () => {
        await latest?.save();
      });

      expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledWith(
        expect.anything(),
        { disable_cooling: expectedOverride },
        expect.anything()
      );
      expect(latest?.draft?.disableCooling).toBe(nextPolicy);
      expect(latest?.dirty).toBe(false);
    }
  );

  it('rewrites the verified source when a canonical exclusion must replace a legacy key', async () => {
    mocks.downloadText.mockResolvedValueOnce(
      JSON.stringify({
        type: 'xai',
        auth_index: 'auth-1',
        account_id: 'account-1',
        excluded_models: ['legacy-model'],
      })
    );
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('excludedModelsText', 'canonical-model'));
    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      'excluded-models': ['canonical-model'],
    });
    await act(async () => {
      await latest?.save();
    });

    expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
    expect(mocks.patchFieldsForAuthIndexes).toHaveBeenCalledWith(
      'xai.json',
      [
        expect.objectContaining({
          name: 'xai.json',
          runtimeId: 'runtime-xai-1',
          authIndex: 'auth-1',
        }),
      ],
      [
        expect.objectContaining({
          name: 'xai.json',
          runtimeId: 'runtime-xai-1',
          authIndex: 'auth-1',
        }),
      ],
      {
        'excluded-models': ['canonical-model'],
        excluded_models: null,
      }
    );
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.lookup).toHaveBeenCalled();
    expect(mocks.reconcileSource).toHaveBeenCalledWith('xai.json');
    expect(latest?.state?.record).toMatchObject({
      'excluded-models': ['canonical-model'],
    });
    expect(latest?.state?.record).not.toHaveProperty('excluded_models');
  });

  it('does not mark formatting-only edits as unsaved but keeps invalid edits guarded', async () => {
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', '  old  '));
    expect(latest?.dirty).toBe(false);
    expect(latest?.canSave).toBe(false);

    act(() => latest?.updateField('priority', '1.5'));
    expect(latest?.dirty).toBe(true);
    expect(latest?.canSave).toBe(false);
    expect(latest?.errors.priority).toBe('accounts.config_error_priority_integer');
  });

  it('keeps a multi-credential single-object source read-only', async () => {
    await act(async () => {
      renderer = create(<Harness sourceMemberCount={2} />);
      await Promise.resolve();
    });
    await flush();

    expect(latest?.sourceMemberCount).toBe(2);
    expect(latest?.sharedSourceReadOnly).toBe(true);
    expect(latest?.canSave).toBe(false);
    expect(latest?.rawDataText).toContain('"note": "old"');

    act(() => latest?.updateField('note', 'must-not-change'));
    expect(latest?.draft?.note).toBe('old');
    expect(latest?.dirty).toBe(false);
    await act(async () => {
      await latest?.save();
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
  });

  it('keeps members of a JSON array editable even when they share a physical file', async () => {
    mocks.downloadText.mockResolvedValue(
      JSON.stringify([
        {
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          note: 'first',
        },
        {
          type: 'xai',
          auth_index: 'auth-2',
          account_id: 'account-2',
          note: 'second',
        },
      ])
    );
    await act(async () => {
      renderer = create(<Harness sourceMemberCount={2} />);
      await Promise.resolve();
    });
    await flush();

    expect(latest?.state?.recordIndex).toBe(0);
    expect(latest?.sharedSourceReadOnly).toBe(false);
    act(() => latest?.updateField('note', 'updated-first'));
    expect(latest?.dirty).toBe(true);
    expect(latest?.canSave).toBe(true);
  });

  it('fails closed when the credential identity disappears before saving', async () => {
    mocks.lookup.mockResolvedValue([]);
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', 'updated'));
    await act(async () => {
      await latest?.save();
    });

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
    expect(mocks.reconcileSource).not.toHaveBeenCalled();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('notification.update_failed'),
      'error'
    );
    expect(latest?.dirty).toBe(true);
    expect(latest?.state?.saving).toBe(false);
  });

  it.each([
    ['runtime ID changed', [{ ...file, id: 'runtime-replacement' }] as AuthFileItem[]],
    ['account ID changed', [{ ...file, account_id: 'account-replacement' }] as AuthFileItem[]],
    [
      'cross-source runtime collision',
      [
        file,
        {
          name: 'other.json',
          id: 'runtime-xai-1',
          type: 'xai',
          provider: 'xai',
          authIndex: 'auth-2',
        } as AuthFileItem,
      ] as AuthFileItem[],
    ],
    [
      'physical selector collision',
      [
        file,
        {
          name: 'other.json',
          id: 'xai.json',
          type: 'xai',
          provider: 'xai',
        } as AuthFileItem,
      ] as AuthFileItem[],
    ],
  ])(
    'fails closed without mutation or reconcile when identity changes: %s',
    async (_label, refreshedFiles) => {
      mocks.lookup.mockResolvedValue(refreshedFiles);
      await act(async () => {
        renderer = create(<Harness />);
        await Promise.resolve();
      });
      await flush();

      act(() => latest?.updateField('note', 'updated'));
      await act(async () => {
        await latest?.save();
      });

      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
      expect(mocks.patchFieldsForAuthIndexes).not.toHaveBeenCalled();
      expect(mocks.reconcileSource).not.toHaveBeenCalled();
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('notification.update_failed'),
        'error'
      );
      expect(latest?.dirty).toBe(true);
      expect(latest?.state?.saving).toBe(false);
    }
  );

  it('fails closed when an unindexed account snapshot changes after preflight lookup', async () => {
    const unindexedFile = {
      name: 'unindexed.json',
      id: 'runtime-unindexed',
      type: 'xai',
      provider: 'xai',
      account: 'original@example.com',
    } as AuthFileItem;
    const refreshedFile = {
      ...unindexedFile,
      account: 'replacement@example.com',
    };
    mocks.downloadText.mockResolvedValue(JSON.stringify({ type: 'xai', note: 'old' }));
    mocks.lookup.mockResolvedValue([refreshedFile]);

    await act(async () => {
      renderer = create(<Harness activeFile={unindexedFile} />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', 'updated'));
    await act(async () => {
      await latest?.save();
    });

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();
    expect(mocks.reconcileSource).not.toHaveBeenCalled();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('notification.update_failed'),
      'error'
    );
    expect(latest?.dirty).toBe(true);
    expect(latest?.state?.saving).toBe(false);
  });

  it('saves an editable JSON-array member with full source identities and reconciles the shared source', async () => {
    const member1 = {
      name: 'shared.json',
      id: 'runtime-1',
      type: 'xai',
      provider: 'xai',
      authIndex: 'auth-1',
      account_id: 'account-1',
    } as AuthFileItem;
    const member2 = {
      name: 'shared.json',
      id: 'runtime-2',
      type: 'xai',
      provider: 'xai',
      authIndex: 'auth-2',
      account_id: 'account-2',
    } as AuthFileItem;
    mocks.downloadText.mockResolvedValue(
      JSON.stringify([
        {
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          note: 'first',
        },
        {
          type: 'xai',
          auth_index: 'auth-2',
          account_id: 'account-2',
          note: 'second',
        },
      ])
    );
    mocks.lookup.mockResolvedValue([member1, member2]);

    await act(async () => {
      renderer = create(<Harness activeFile={member1} sourceMemberCount={2} />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', 'updated-first'));
    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      note: 'updated-first',
    });

    await act(async () => {
      await latest?.save();
    });

    expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'shared.json', authIndex: 'auth-1' }),
      { note: 'updated-first' },
      [
        expect.objectContaining({ name: 'shared.json', authIndex: 'auth-1' }),
        expect.objectContaining({ name: 'shared.json', authIndex: 'auth-2' }),
      ]
    );
    expect(mocks.reconcileSource).toHaveBeenCalledWith('shared.json');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(latest?.dirty).toBe(false);
  });

  it('deduplicates repeated save requests for the same credential', async () => {
    let resolvePatch!: () => void;
    mocks.patchFieldsWithPluginSourceFallback.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = () => resolve({ status: 'ok' });
      })
    );
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();
    act(() => latest?.updateField('note', 'updated'));
    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      note: 'updated',
    });

    let firstSave!: Promise<void>;
    let duplicateSave!: Promise<void>;
    await act(async () => {
      firstSave = latest!.save();
      duplicateSave = latest!.save();
      await Promise.resolve();
    });

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePatch();
      await Promise.all([firstSave, duplicateSave]);
    });

    expect(mocks.reconcileSource).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith('accounts.config_saved_success', 'success');
  });

  it('normalizes a negative weight to an explicit zero after saving', async () => {
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('weight', '-8'));
    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      weight: 0,
    });
    await act(async () => {
      await latest?.save();
    });

    expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledWith(
      expect.anything(),
      { weight: 0 },
      expect.anything()
    );
    expect(latest?.draft?.weight).toBe('0');
    expect(latest?.dirty).toBe(false);
  });

  it('retains successful save with fallback draft and download warning when raw download fails', async () => {
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', 'updated-note'));
    mocks.downloadText.mockRejectedValueOnce(new Error('raw download network error'));

    await act(async () => {
      await latest?.save();
    });

    expect(latest?.dirty).toBe(false);
    expect(latest?.draft?.note).toBe('updated-note');
    expect(mocks.showNotification).toHaveBeenCalledWith('accounts.config_saved_success', 'success');
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('notification.download_failed'),
      'warning'
    );
    expect(mocks.reconcileSource).toHaveBeenCalledWith('xai.json');
    expect(mocks.onSaved).toHaveBeenCalledWith('xai.json');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('keeps a successful save successful when the accounts source reconciliation fails', async () => {
    mocks.reconcileSource.mockRejectedValueOnce(new Error('reconciliation failed'));
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', 'updated'));
    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      note: 'updated',
    });
    await act(async () => {
      await latest?.save();
    });

    expect(latest?.dirty).toBe(false);
    expect(mocks.onSaved).toHaveBeenCalledWith('xai.json');
    expect(mocks.showNotification).toHaveBeenCalledWith('accounts.config_saved_success', 'success');
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('notification.load_failed'),
      'warning'
    );
    expect(mocks.showNotification).not.toHaveBeenCalledWith(
      expect.stringContaining('notification.update_failed'),
      'error'
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('keeps save successful with fallback draft and two warnings when both raw download and reconcile fail', async () => {
    mocks.reconcileSource.mockRejectedValueOnce(new Error('reconciliation failed'));
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', 'updated-note'));
    mocks.downloadText.mockRejectedValueOnce(new Error('raw download failed'));

    await act(async () => {
      await latest?.save();
    });

    expect(latest?.dirty).toBe(false);
    expect(latest?.draft?.note).toBe('updated-note');
    expect(mocks.showNotification).toHaveBeenCalledWith('accounts.config_saved_success', 'success');
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('notification.download_failed'),
      'warning'
    );
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('notification.load_failed'),
      'warning'
    );
    expect(mocks.onSaved).toHaveBeenCalledWith('xai.json');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('uses the persisted source record for raw data after saving', async () => {
    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();

    act(() => latest?.updateField('note', ''));
    setDownloadedRecord({
      type: 'xai',
      auth_index: 'auth-1',
      account_id: 'account-1',
      note: '',
    });

    await act(async () => {
      await latest?.save();
    });

    expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledWith(
      expect.anything(),
      { note: '' },
      expect.anything()
    );
    expect(latest?.state?.record).toHaveProperty('note', '');
    expect(latest?.rawDataText).toContain('"note": ""');
    expect(latest?.dirty).toBe(false);
  });

  it('does not overwrite a sibling editor when an earlier save finishes late', async () => {
    const sibling = {
      ...file,
      id: 'runtime-xai-2',
      authIndex: 'auth-2',
      account: 'sibling@example.com',
      account_id: 'account-2',
    } as AuthFileItem;
    mocks.downloadText.mockImplementation(async (name: string) =>
      JSON.stringify(
        name === sibling.name
          ? {
              type: 'xai',
              auth_index: 'auth-2',
              account_id: 'account-2',
              note: 'sibling',
            }
          : {
              type: 'xai',
              auth_index: 'auth-1',
              account_id: 'account-1',
              note: 'old',
            }
      )
    );
    sibling.name = 'xai-sibling.json';
    mocks.lookup.mockImplementation(async (target: { name: string }) => {
      if (target.name === sibling.name) return [sibling];
      if (target.name === file.name) return [file];
      return [];
    });
    let resolvePatch!: () => void;
    mocks.patchFieldsWithPluginSourceFallback.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = () => resolve({ status: 'ok' });
      })
    );

    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();
    act(() => latest?.updateField('note', 'updated'));

    let saveRequest!: Promise<void>;
    await act(async () => {
      saveRequest = latest!.save();
      await Promise.resolve();
    });
    await act(async () => {
      renderer?.update(<Harness activeFile={sibling} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(latest?.state?.fileName).toBe('xai-sibling.json');
    expect(latest?.draft?.note).toBe('sibling');

    await act(async () => {
      resolvePatch();
      await saveRequest;
    });

    expect(latest?.state?.fileName).toBe('xai-sibling.json');
    expect(latest?.draft?.note).toBe('sibling');
    expect(mocks.onSaved).not.toHaveBeenCalled();
  });

  it('does not overwrite a reloaded editor when the same credential is revisited', async () => {
    const sibling = {
      ...file,
      name: 'xai-sibling.json',
      id: 'runtime-xai-2',
      authIndex: 'auth-2',
      account: 'sibling@example.com',
      account_id: 'account-2',
    } as AuthFileItem;
    let primaryDownloadCount = 0;
    mocks.downloadText.mockImplementation(async (name: string) => {
      if (name === sibling.name) {
        return JSON.stringify({
          type: 'xai',
          auth_index: 'auth-2',
          account_id: 'account-2',
          note: 'sibling',
        });
      }
      primaryDownloadCount += 1;
      return JSON.stringify({
        type: 'xai',
        auth_index: 'auth-1',
        account_id: 'account-1',
        note: primaryDownloadCount === 1 ? 'old' : 'reloaded',
      });
    });
    mocks.lookup.mockImplementation(async (target: { name: string }) => {
      if (target.name === sibling.name) return [sibling];
      if (target.name === file.name) return [file];
      return [];
    });
    let resolvePatch!: () => void;
    mocks.patchFieldsWithPluginSourceFallback.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = () => resolve({ status: 'ok' });
      })
    );

    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });
    await flush();
    act(() => latest?.updateField('note', 'saved-late'));

    let saveRequest!: Promise<void>;
    await act(async () => {
      saveRequest = latest!.save();
      await Promise.resolve();
    });
    await act(async () => {
      renderer?.update(<Harness activeFile={sibling} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();
    await act(async () => {
      renderer?.update(<Harness activeFile={file} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(latest?.draft?.note).toBe('reloaded');
    act(() => latest?.updateField('note', 'newer-draft'));
    await act(async () => {
      await latest?.save();
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.lookup).toHaveBeenCalled();
    expect(mocks.patchFieldsWithPluginSourceFallback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePatch();
      await saveRequest;
    });

    expect(latest?.draft?.note).toBe('newer-draft');
    expect(latest?.rawDataText).toContain('"note": "reloaded"');
    expect(latest?.dirty).toBe(true);
    expect(mocks.onSaved).not.toHaveBeenCalled();
  });

  it('does not expose or save a draft from a previous CPA connection', async () => {
    let resolveSecondDownload!: (value: string) => void;
    const secondDownload = new Promise<string>((resolve) => {
      resolveSecondDownload = resolve;
    });
    mocks.downloadText
      .mockResolvedValueOnce(
        JSON.stringify({
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          note: 'connection-a',
        })
      )
      .mockReturnValueOnce(secondDownload);

    await act(async () => {
      renderer = create(<Harness connectionKey="connection-a" />);
      await Promise.resolve();
    });
    await flush();
    act(() => latest?.updateField('note', 'dirty-on-a'));
    expect(latest?.dirty).toBe(true);

    await act(async () => {
      renderer?.update(<Harness connectionKey="connection-b" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest?.state).toMatchObject({ loading: true, record: null, draft: null });
    expect(latest?.dirty).toBe(false);
    await act(async () => {
      await latest?.save();
    });
    expect(mocks.patchFieldsWithPluginSourceFallback).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecondDownload(
        JSON.stringify({
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          note: 'connection-b',
        })
      );
      await secondDownload;
    });
    await flush();

    expect(latest?.draft?.note).toBe('connection-b');
    expect(latest?.dirty).toBe(false);
  });

  it.each([
    ['preflight late'],
    ['mutation late'],
    ['raw download late'],
    ['reconcile late'],
  ] as const)(
    'does not contaminate new connection when save finishes late on %s',
    async (phase) => {
      const deferredPreflight = createDeferred<AuthFileItem[]>();
      const deferredMutation = createDeferred<{ status: string }>();
      const deferredDownload = createDeferred<string>();
      const deferredReconcile = createDeferred<void>();

      mocks.downloadText.mockImplementation(async () =>
        JSON.stringify({
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          note: 'connection-a',
        })
      );

      if (phase === 'preflight late') {
        mocks.lookup.mockReturnValue(deferredPreflight.promise);
      } else {
        mocks.lookup.mockResolvedValue([file]);
      }

      if (phase === 'mutation late') {
        mocks.patchFieldsWithPluginSourceFallback.mockReturnValue(deferredMutation.promise);
      } else {
        mocks.patchFieldsWithPluginSourceFallback.mockResolvedValue({ status: 'ok' });
      }

      if (phase === 'reconcile late') {
        mocks.reconcileSource.mockReturnValue(deferredReconcile.promise);
      } else {
        mocks.reconcileSource.mockResolvedValue(undefined);
      }

      await act(async () => {
        renderer = create(<Harness connectionKey="connection-a" />);
        await Promise.resolve();
      });
      await flush();

      act(() => latest?.updateField('note', 'save-on-a'));

      if (phase === 'raw download late') {
        mocks.downloadText.mockReturnValue(deferredDownload.promise);
      }

      let savePromise!: Promise<void>;
      act(() => {
        savePromise = latest!.save();
      });

      // Switch to connection-b
      mocks.downloadText.mockImplementation(async () =>
        JSON.stringify({
          type: 'xai',
          auth_index: 'auth-1',
          account_id: 'account-1',
          note: 'connection-b',
        })
      );
      mocks.showNotification.mockClear();

      await act(async () => {
        renderer?.update(<Harness connectionKey="connection-b" />);
        await Promise.resolve();
        await Promise.resolve();
      });
      await flush();

      expect(latest?.draft?.note).toBe('connection-b');

      // Resolve old connection pending promise
      await act(async () => {
        if (phase === 'preflight late') deferredPreflight.resolve([file]);
        if (phase === 'mutation late') deferredMutation.resolve({ status: 'ok' });
        if (phase === 'raw download late') {
          deferredDownload.resolve(
            JSON.stringify({
              type: 'xai',
              auth_index: 'auth-1',
              account_id: 'account-1',
              note: 'save-on-a',
            })
          );
        }
        if (phase === 'reconcile late') deferredReconcile.resolve();
        await savePromise;
      });

      // New connection state is NOT overwritten
      expect(latest?.draft?.note).toBe('connection-b');
      expect(mocks.onSaved).not.toHaveBeenCalled();
      expect(mocks.showNotification).not.toHaveBeenCalledWith(
        'accounts.config_saved_success',
        'success'
      );
    }
  );
});
