import { GenesisError, type AppletContext, type AppletStorage, type StorageChange, type StorageBatch } from '@genesis/sdk';

// The HN applet owns this protocol. Genesis transports opaque JSON.
const clients = new WeakMap<AppletContext, AppletStorage>();
export function backendStorage(context: AppletContext): AppletStorage {
  const existing = clients.get(context); if (existing) return existing;
  const listeners = new Set<(change: StorageChange) => void>();
  async function call<T extends { namespaceRevision: number }>(operation: string, params: unknown): Promise<T> {
    const response = await context.services.request<{ status: number; body: {
      result?: T; changes?: StorageChange['changes']; error?: { code: string; message: string };
    } }>('bookmarks', { method: 'POST', path: '/v1/documents', body: { operation, params } });
    if (response.status < 200 || response.status >= 300 || response.body.error) {
      throw new GenesisError(response.body.error?.code ?? 'SERVICE_FAILURE', response.body.error?.message ?? 'Backend request failed. Reload before retrying.');
    }
    if (!response.body.result || typeof response.body.result !== 'object') throw new GenesisError('SERVICE_FAILURE', 'Backend returned an invalid result. Reload before retrying.');
    if (operation === 'commit' && !context.signal.aborted) {
      const change = { changes: response.body.changes ?? [], namespaceRevision: response.body.result.namespaceRevision };
      // Notify after the write's promise settles, independently of individual subscribers.
      queueMicrotask(() => { for (const listener of listeners) { try { listener(change); } catch (error) { console.error('HN change listener failed', error); } } });
    }
    return response.body.result;
  }
  const storage: AppletStorage = {
    get: (collection, key) => call('get', { collection, key }),
    list: (collection, options) => call('list', { collection, ...options }),
    commit: (batch: StorageBatch) => call('commit', batch),
    onChanged: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
  };
  context.onDispose(() => listeners.clear()); clients.set(context, storage); return storage;
}
