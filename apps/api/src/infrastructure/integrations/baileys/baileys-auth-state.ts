import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { ConversationProviderStateStore } from '../../../application/ports/conversation.port';

const CREDS_KEY = 'baileys:creds';

type StateScope = { tenantId: string; channelId: string; providerKey: string };

function stateKey(type: keyof SignalDataTypeMap, id: string): string {
  return `baileys:key:${type}:${id}`;
}

function parseStored<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}

function serialize(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

export async function createBaileysAuthState(store: ConversationProviderStateStore, scope: StateScope): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}> {
  const storedCreds = await store.get(scope.tenantId, scope.channelId, scope.providerKey, CREDS_KEY);
  const state: AuthenticationState = {
    creds: storedCreds ? parseStored(storedCreds) : initAuthCreds(),
    keys: {
      async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        await Promise.all(ids.map(async (id) => {
          const stored = await store.get(scope.tenantId, scope.channelId, scope.providerKey, stateKey(type, id));
          if (!stored) return;
          let value = parseStored<SignalDataTypeMap[T]>(stored);
          if (type === 'app-state-sync-key') {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as proto.Message.IAppStateSyncKeyData) as unknown as SignalDataTypeMap[T];
          }
          result[id] = value;
        }));
        return result;
      },
      async set(data: SignalDataSet) {
        const writes: Promise<void>[] = [];
        for (const type of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
          for (const [id, value] of Object.entries(data[type] ?? {})) {
            writes.push(value === null
              ? store.remove(scope.tenantId, scope.channelId, scope.providerKey, stateKey(type, id))
              : store.set({ ...scope, stateKey: stateKey(type, id), value: serialize(value) }));
          }
        }
        await Promise.all(writes);
      },
      clear: () => store.clear(scope.tenantId, scope.channelId, scope.providerKey),
    },
  };

  return {
    state,
    saveCreds: () => store.set({ ...scope, stateKey: CREDS_KEY, value: serialize(state.creds) }),
    clear: () => store.clear(scope.tenantId, scope.channelId, scope.providerKey),
  };
}
