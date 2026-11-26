import { describe, it, expect, beforeEach } from 'vitest';
import api from './api.js';
import { useAuthStore } from '../store/authStore.js';

// Fake network: returns an empty 200 response and keeps the request config.
let lastConfig;
api.defaults.adapter = async (config) => {
  lastConfig = config;
  return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
};

describe('api client', () => {
  beforeEach(() => {
    lastConfig = undefined;
    useAuthStore.getState().logout();
  });

  it('sends the Bearer token when the user is logged in', async () => {
    useAuthStore.getState().login({ id: 'u1' }, 'tok123');
    await api.get('/courses');
    expect(lastConfig.headers.Authorization).toBe('Bearer tok123');
  });

  it('sends no Authorization header when logged out', async () => {
    await api.get('/courses');
    expect(lastConfig.headers.Authorization).toBeUndefined();
  });

  it('uses /api as the base URL by default', async () => {
    await api.get('/courses');
    expect(lastConfig.baseURL).toBe('/api');
  });
});
