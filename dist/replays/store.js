export const REPLAY_SLOTS = 5,
  REPLAY_STORAGE_BYTES = 40 * 1024 * 1024;
export class ReplayStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.pending = null;
  }
  open() {
    if (!this.indexedDB)
      return Promise.reject(
        Error('Replay storage is unavailable. Export a replay file instead.'),
      );
    if (!this.pending)
      this.pending = new Promise((resolve, reject) => {
        const r = this.indexedDB.open('boost-circuit-replays', 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore('clips', {keyPath: 'id'});
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => {
          this.pending = null;
          reject(Error('Replay storage could not open.'));
        };
        r.onblocked = () =>
          reject(Error('Close another game tab to update replay storage.'));
      });
    return this.pending;
  }
  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db.transaction('clips').objectStore('clips').getAll();
      r.onsuccess = () =>
        resolve(r.result.sort((a, b) => b.addedAt - a.addedAt));
      r.onerror = () => reject(Error('Saved replays could not load.'));
    });
  }
  async save(clip) {
    const db = await this.open(),
      size = JSON.stringify(clip).length * 2;
    if (size > REPLAY_STORAGE_BYTES)
      throw Error('This replay exceeds the local storage budget.');
    return new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite'),
        store = tx.objectStore('clips');
      store.put({id: clip.id, addedAt: Date.now(), size, clip});
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = all.result.sort((a, b) => b.addedAt - a.addedAt);
        let total = 0;
        for (let i = 0; i < rows.length; i++) {
          total += rows[i].size;
          if (i >= REPLAY_SLOTS || total > REPLAY_STORAGE_BYTES)
            store.delete(rows[i].id);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          Error(
            'Replay storage is full or unavailable. Export this replay to keep it.',
          ),
        );
    });
  }
  async remove(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('clips', 'readwrite');
      t.objectStore('clips').delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(Error('This replay could not be removed.'));
    });
  }
}
