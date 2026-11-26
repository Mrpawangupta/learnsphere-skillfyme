import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore.js';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('starts logged out', () => {
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });

  it('login stores the user and token', () => {
    useAuthStore.getState().login({ id: 'u1', name: 'Pawan' }, 'tok123');
    const s = useAuthStore.getState();
    expect(s.user.name).toBe('Pawan');
    expect(s.token).toBe('tok123');
    expect(s.isAuthenticated).toBe(true);
  });

  it('logout clears the session', () => {
    useAuthStore.getState().login({ id: 'u1' }, 'tok123');
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });

  it('updateUser merges new fields into the user', () => {
    useAuthStore.getState().login({ id: 'u1', name: 'Pawan' }, 'tok123');
    useAuthStore.getState().updateUser({ name: 'Pawan G' });
    const s = useAuthStore.getState();
    expect(s.user.id).toBe('u1');
    expect(s.user.name).toBe('Pawan G');
  });
});
