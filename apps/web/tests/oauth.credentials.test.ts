import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oauthApi } from '@/services/api/oauth';

vi.mock('@/features/demo/demoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/demo/demoMode')>()),
  isDemoMode: () => false,
}));

let server: Server;
let scope: { apiBase: string; managementKey: string };
let response: unknown;
let responseStatus: number;
let requests: Array<{
  url?: string;
  method?: string;
  authorization?: string;
  contentType?: string;
  body: string;
}>;

beforeEach(async () => {
  requests = [];
  response = { ok: true, id: 'fixture-credential-id', label: 'Work' };
  responseStatus = 200;
  server = createServer((request, reply) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.authorization,
        contentType: request.headers['content-type'],
        body,
      });
      reply.writeHead(responseStatus, { 'Content-Type': 'application/json' });
      reply.end(JSON.stringify(response));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  scope = {
    apiBase: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    managementKey: 'fixture-manager-key',
  };
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('plugin credential management HTTP contract', () => {
  it.each(['qwen-cliproxyapi', 'opencode-go-cliproxyapi'])(
    'POSTs %s JSON fields with management authorization to the exact plugin route, not a query string',
    async (pluginId) => {
      const result = await oauthApi.submitPluginCredential(
        pluginId,
        `/v0/management/plugins/${pluginId}/credentials`,
        { base_url: 'https://api.example/v1', api_key: 'fixture-secret', name: 'Work' },
        scope
      );
      expect(result).toEqual(response);
      expect(requests).toEqual([
        {
          url: `/v0/management/plugins/${pluginId}/credentials`,
          method: 'POST',
          authorization: 'Bearer fixture-manager-key',
          contentType: 'application/json',
          body: JSON.stringify({
            base_url: 'https://api.example/v1',
            api_key: 'fixture-secret',
            name: 'Work',
          }),
        },
      ]);
    }
  );

  it('preserves login-start metadata returned by an isolated HTTP fixture', async () => {
    response = {
      url: '/plugin/login',
      metadata: {
        auth_kind: 'manual_api_key',
        submit_path: '/v0/management/plugins/qwen-cliproxyapi/credentials',
        fields: [{ name: 'api_key' }],
      },
    };
    expect(await oauthApi.startAuth('qwen', scope)).toEqual(response);
    expect(requests[0].url).toBe('/v0/management/qwen-auth-url');
  });

  it('surfaces HTTP plugin error text unchanged', async () => {
    responseStatus = 422;
    response = { error: 'plugin says: invalid base url' };
    await expect(
      oauthApi.submitPluginCredential(
        'qwen-cliproxyapi',
        '/v0/management/plugins/qwen-cliproxyapi/credentials',
        { api_key: 'fixture-secret' },
        scope
      )
    ).rejects.toThrow('plugin says: invalid base url');
  });

  it('rejects an error response even when the host returns HTTP 200', async () => {
    response = { status: 'error', error: 'plugin credential not saved' };
    await expect(
      oauthApi.submitPluginCredential(
        'qwen-cliproxyapi',
        '/v0/management/plugins/qwen-cliproxyapi/credentials',
        {},
        scope
      )
    ).rejects.toThrow('plugin credential not saved');
  });

  it('rejects external, cross-plugin, traversal, and query destinations before sending any credentials', async () => {
    for (const path of [
      'https://evil.example/credentials',
      '//evil.example/credentials',
      '/v0/management/plugins/other/credentials',
      '/v0/management/plugins/qwen-cliproxyapi/../other/credentials',
      '/v0/management/plugins/qwen-cliproxyapi/%2e%2e/other',
      '/v0/management/plugins/qwen-cliproxyapi/credentials?key=secret',
    ]) {
      await expect(
        oauthApi.submitPluginCredential(
          'qwen-cliproxyapi',
          path,
          { api_key: 'fixture-secret' },
          scope
        )
      ).rejects.toThrow('Invalid plugin credential submit path');
    }
    expect(requests).toHaveLength(0);
  });
});
