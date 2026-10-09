import { getPluginCredentialSubmitPath } from '@/services/api/oauth';
import { isRecord } from '@/utils/helpers';
import { getPlanCredentialDefaultBaseUrl } from '@/utils/planCredentials';
import { isPlanCredentialPlugin } from '@/features/plugins/planPlugins';

export interface PluginCredentialField {
  name: string;
  label: string;
  placeholder?: string;
  type: 'text' | 'password';
  required: boolean;
}

export interface PluginCredentialFormDefinition {
  submitPath: string;
  submitLabel: string;
  fields: PluginCredentialField[];
}

export const readPluginCredentialForm = (
  pluginId: string,
  metadata: unknown
): PluginCredentialFormDefinition | undefined => {
  if (!isRecord(metadata) || metadata.auth_kind !== 'manual_api_key') return undefined;
  if (
    !getPluginCredentialSubmitPath(pluginId, metadata.submit_path) ||
    !Array.isArray(metadata.fields)
  ) {
    throw new Error('Invalid plugin credential form metadata');
  }
  const isPlan = isPlanCredentialPlugin(pluginId);
  const names = new Set<string>();
  const fields = metadata.fields.map((field): PluginCredentialField => {
    if (
      !isRecord(field) ||
      typeof field.name !== 'string' ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name) ||
      names.has(field.name)
    ) {
      throw new Error('Invalid plugin credential form field');
    }
    names.add(field.name);
    return {
      name: field.name,
      label: typeof field.label === 'string' ? field.label : field.name,
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
      type: field.name === 'api_key' || field.type === 'password' ? 'password' : 'text',
      required:
        isPlan && (field.name === 'base_url' || field.name === 'name')
          ? false
          : field.required === true,
    };
  });
  if (isPlan) {
    const order = ['name', 'base_url', 'api_key'];
    const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
    // Reorder declared fields without adding or dropping any host-provided fields.
    fields.sort((left, right) => rank(left.name) - rank(right.name));
  }
  if (!fields.length) throw new Error('Invalid plugin credential form metadata');
  return {
    submitPath: metadata.submit_path as string,
    submitLabel:
      typeof metadata.submit_label === 'string' && metadata.submit_label.trim()
        ? metadata.submit_label
        : '添加凭证',
    fields,
  };
};

// Older hosts omit login-start metadata. Keep this compatibility list explicit and plugin-specific.
export const getPluginCredentialFormFallback = (
  pluginId: string
): PluginCredentialFormDefinition | undefined => {
  if (!isPlanCredentialPlugin(pluginId)) return undefined;
  return {
    submitPath: `/v0/management/plugins/${pluginId}/credentials`,
    submitLabel: '添加凭证',
    fields: [
      {
        name: 'name',
        label: '别名',
        placeholder: '留空显示脱敏 API Key',
        type: 'text',
        required: false,
      },
      {
        name: 'base_url',
        label: 'Base URL',
        placeholder: getPlanCredentialDefaultBaseUrl(pluginId),
        type: 'text',
        required: false,
      },
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  };
};
