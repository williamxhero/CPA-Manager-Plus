import { getPluginCredentialSubmitPath } from '@/services/api/oauth';
import { isRecord } from '@/utils/helpers';

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
      required: field.required === true,
    };
  });
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
): PluginCredentialFormDefinition | undefined =>
  pluginId === 'qwen-cliproxyapi'
    ? {
        submitPath: '/v0/management/plugins/qwen-cliproxyapi/credentials',
        submitLabel: '添加凭证',
        fields: [
          {
            name: 'base_url',
            label: 'Base URL',
            placeholder: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
            type: 'text',
            required: true,
          },
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          { name: 'name', label: '凭证名称', type: 'text', required: false },
        ],
      }
    : undefined;
