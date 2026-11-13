// Tickets travel in an encrypted first WebSocket message, never in an invite,
// query string, localStorage, analytics or logs. A room owns this credential for
// its lifetime so brief disconnects authenticate as the same guest.
export class ServerCredentials {
  constructor(endpoint, {fetcher = globalThis.fetch} = {}) {
    const url = new URL(endpoint);
    url.protocol = 'https:';
    url.pathname = '/api/';
    url.search = '';
    this.base = url.href;
    // Window.fetch checks its receiver. Calling a stored native fetch as
    // this.fetcher() otherwise passes ServerCredentials and throws in browsers.
    this.fetcher = fetcher.bind(globalThis);
    this.session = null;
  }
  async post(path, token) {
    const response = await this.fetcher(this.base + path, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: 'Bearer ' + token} : {})
      },
      body: '{}',
      signal: AbortSignal.timeout(75000)
    });
    return {ok: response.ok, status: response.status, value: await response.json()};
  }
  async ticket() {
    if (!this.session || this.session.expires < Date.now() + 30000) {
      const reply = await this.post('session');
      if (!reply.ok || typeof reply.value.token !== 'string')
        throw Error('The server could not create a guest session. Try again shortly.');
      this.session = reply.value;
    }
    const reply = await this.post('ticket', this.session.token);
    if (!reply.ok) {
      if (reply.status === 401) this.session = null;
      throw Error('The guest session could not be authenticated. Reconnect and try again.');
    }
    if (typeof reply.value.ticket !== 'string')
      throw Error('The server returned an invalid connection ticket.');
    return reply.value.ticket;
  }
}
