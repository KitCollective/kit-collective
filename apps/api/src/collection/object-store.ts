export type ObjectStoreAdapter = {
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  getObject(key: string): Promise<Uint8Array | null>;
};

export function createMemoryObjectStore(): ObjectStoreAdapter {
  const objects = new Map<string, Uint8Array>();

  return {
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      objects.set(key, bytes);
    },
    async objectExists(key: string): Promise<boolean> {
      return objects.has(key);
    },
    async getObject(key: string): Promise<Uint8Array | null> {
      return objects.get(key) ?? null;
    },
  };
}
