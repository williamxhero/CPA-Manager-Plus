import { apiCallApi, getApiCallErrorDetails } from '@/services/api';
import { buildHeaderObject, hasHeader, type HeaderEntry } from '@/utils/headers';
import { buildOpenAIModelsEndpoint } from './utils';

export const OPENAI_KEY_TEST_TIMEOUT_MS = 30_000;

export interface OpenAIKeyTestInput {
  baseUrl: string;
  keyEntry: {
    apiKey: string;
    proxyUrl?: string;
    headers?: Record<string, string | undefined | null>;
  };
  headers: HeaderEntry[];
  authIndex?: string;
}

/** Verify OpenAI-compatible connectivity without consuming model quota. */
export async function testOpenAIKey(input: OpenAIKeyTestInput): Promise<void> {
  const endpoint = buildOpenAIModelsEndpoint(input.baseUrl);
  if (!endpoint) {
    throw new Error('OpenAI-compatible base URL is required');
  }

  const headerObject = {
    ...buildHeaderObject(input.keyEntry.headers),
    ...buildHeaderObject(input.headers),
  };
  const headers: Record<string, string> = { ...headerObject };
  if (!hasHeader(headers, 'authorization')) {
    headers.Authorization = input.authIndex
      ? 'Bearer $TOKEN$'
      : `Bearer ${input.keyEntry.apiKey.trim()}`;
  }

  const result = await apiCallApi.request(
    {
      authIndex: input.authIndex,
      proxyUrl: input.keyEntry.proxyUrl,
      method: 'GET',
      url: endpoint,
      header: Object.keys(headers).length ? headers : undefined,
    },
    { timeout: OPENAI_KEY_TEST_TIMEOUT_MS }
  );

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorDetails(result));
  }
}
