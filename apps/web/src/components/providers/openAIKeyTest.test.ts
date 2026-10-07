import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@/services/api', () => ({
  apiCallApi: { request },
  getApiCallErrorDetails: vi.fn(() => 'request failed'),
}));

import { testOpenAIKey } from './openAIKeyTest';

describe('testOpenAIKey', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ statusCode: 200 });
  });

  it('checks /models without consuming chat completion quota', async () => {
    await testOpenAIKey({
      baseUrl: 'https://api.example.com/v1/',
      keyEntry: { apiKey: ' secret ', proxyUrl: 'http://proxy.example:8080' },
      headers: [{ key: 'X-Test', value: ' value ' }],
    });

    expect(request).toHaveBeenCalledWith(
      {
        method: 'GET',
        url: 'https://api.example.com/v1/models',
        proxyUrl: 'http://proxy.example:8080',
        header: {
          'X-Test': 'value',
          Authorization: 'Bearer secret',
        },
      },
      { timeout: 30_000 }
    );
  });

  it('uses the auth index token placeholder when testing a managed credential', async () => {
    await testOpenAIKey({
      baseUrl: 'http://127.0.0.1:8317',
      keyEntry: { apiKey: '' },
      headers: [],
      authIndex: 'qwen-main',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        authIndex: 'qwen-main',
        method: 'GET',
        url: 'http://127.0.0.1:8317/models',
        header: { Authorization: 'Bearer $TOKEN$' },
      }),
      expect.anything()
    );
  });

  it('preserves upstream error details', async () => {
    request.mockResolvedValueOnce({ statusCode: 429, bodyText: '{"error":"quota"}' });
    await expect(
      testOpenAIKey({
        baseUrl: 'https://api.example.com/v1',
        keyEntry: { apiKey: 'secret' },
        headers: [],
      })
    ).rejects.toThrow('request failed');
  });
});
