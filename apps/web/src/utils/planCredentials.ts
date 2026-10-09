export const getPlanCredentialDefaultBaseUrl = (provider: string): string => {
  switch (provider.trim().toLowerCase().replace(/_/g, '-')) {
    case 'qwen':
    case 'qwen-cliproxyapi':
      return 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
    case 'opencode-go':
    case 'opencode-go-cliproxyapi':
      return 'https://opencode.ai/zen/go/v1';
    default:
      return '';
  }
};

const hasWhitespaceOrControl = (value: string): boolean =>
  Array.from(value).some(
    (char) => /\s/.test(char) || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
  );

export const isValidPlanCredentialBaseUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      /^https?:\/\/[^/]/i.test(value) &&
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname) &&
      !value.includes('?') &&
      !value.includes('#') &&
      !value.includes('\\') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !hasWhitespaceOrControl(value)
    );
  } catch {
    return false;
  }
};

export const isValidPlanCredentialApiKey = (value: string): boolean =>
  Boolean(value) && !hasWhitespaceOrControl(value);

export const maskPlanCredentialKey = (value: string): string => {
  const chars = Array.from(value.trim());
  if (chars.length >= 12) return `${chars.slice(0, 4).join('')}...${chars.slice(-4).join('')}`;
  if (chars.length >= 8) return `${chars.slice(0, 2).join('')}...${chars.slice(-2).join('')}`;
  return '...';
};

export const redactPlanCredentialText = (value: string, keys: string[]): string =>
  [...new Set(keys.filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .reduce((text, key) => text.split(key).join('[redacted]'), value);
