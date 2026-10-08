export const PLAN_PLUGIN_TITLES: Readonly<Record<string, string>> = {
  'qwen-cliproxyapi': 'Qwen',
  'opencode-go-cliproxyapi': 'OpenCode',
};

export const isPlanCredentialPlugin = (pluginId: string): boolean =>
  Object.prototype.hasOwnProperty.call(PLAN_PLUGIN_TITLES, pluginId);
