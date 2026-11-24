import {mkdir, readFile, writeFile, rename, unlink} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Node uses a private persistent directory. Cloudflare uses SQLite Durable
// Object storage through the same list/transaction contract.
export class FileProfileStore {
  constructor(directory) {
    this.directory = resolve(directory);
    this.file = join(this.directory, 'profiles.json');
    this.pending = Promise.resolve();
  }
  async ready() {
    if (!this.loading)
      this.loading = (async () => {
        try {
          this.rows = new Map(JSON.parse(await readFile(this.file, 'utf8')));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          this.rows = new Map();
        }
      })().catch((error) => {
        this.loading = null;
        throw error;
      });
    return this.loading;
  }
  async list({prefix = '', startAfter = '', limit = 1000} = {}) {
    await this.ready();
    await this.pending;
    return new Map(
      [...this.rows]
        .filter(([key]) => key.startsWith(prefix) && key > startAfter)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit)
        .map(([key, value]) => [key, structuredClone(value)]),
    );
  }
  transaction(callback) {
    const operation = this.pending.then(async () => {
      await this.ready();
      const draft = new Map(structuredClone([...this.rows]));
      let open = true;
      try {
        await callback({
          put: async (key, value) => {
            if (!open) throw Error('The profile transaction is closed.');
            draft.set(key, structuredClone(value));
          },
        });
      } finally {
        open = false;
      }
      await mkdir(this.directory, {recursive: true, mode: 0o700});
      const temporary = join(
        this.directory,
        'profiles-' + randomUUID() + '.tmp',
      );
      try {
        await writeFile(temporary, JSON.stringify([...draft]), {
          mode: 0o600,
          flag: 'wx',
        });
        await rename(temporary, this.file);
        this.rows = draft;
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    });
    // Reject the failed save, but keep future transactions usable.
    this.pending = operation.catch(() => {});
    return operation;
  }
  put(key, value) {
    return this.transaction((transaction) => transaction.put(key, value));
  }
}
