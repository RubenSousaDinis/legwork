import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiUrl,
  dashboardUrl,
  DEPLOYED_API,
  DEPLOYED_DASHBOARD,
  DEPLOYED_MINIAPP,
  miniappUrl,
} from '../lib/urls';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public origins', () => {
  it('skipsLoopbackAndPrintsTheHostedApps', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001');
    vi.stubEnv('NEXT_PUBLIC_MINIAPP_URL', 'http://127.0.0.1:3002');
    vi.stubEnv('VERCEL_URL', 'legwork-dashboard-abc-ruben-dinis-projects.vercel.app');
    expect(apiUrl()).toBe(DEPLOYED_API);
    expect(miniappUrl()).toBe(DEPLOYED_MINIAPP);
    expect(dashboardUrl()).toBe(DEPLOYED_DASHBOARD);
  });

  it('keepsANonLoopbackOverride', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
    vi.stubEnv('NEXT_PUBLIC_MINIAPP_URL', 'https://mini.example.test');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'dash.example.test');
    expect(apiUrl()).toBe('https://api.example.test');
    expect(miniappUrl()).toBe('https://mini.example.test');
    expect(dashboardUrl()).toBe('https://dash.example.test');
  });
});
