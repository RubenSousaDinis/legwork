import { describe, expect, it } from 'vitest';
import { config as proxyConfig, proxy } from '../../proxy';
import { config as edgeConfig } from './edge';
import { request } from './testRequest';

describe('proxy entry point', () => {
  it('carries the same matcher as edge.ts (Next reads it statically, so it is a literal here)', () => {
    expect(proxyConfig).toEqual(edgeConfig);
  });

  it('delegates to the composed guards', async () => {
    const res = await proxy(request('/check', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
