import {randomBytes, randomUUID} from 'node:crypto';

// Anonymous guest authentication: the server issues unguessable credentials.
// This authenticates a reconnecting session, not a person's real identity.
// Credentials are held only in memory and never put in URLs or logs.
export class GuestAuth {
  constructor({clock = () => Date.now(), maxSessions = 1024} = {}) {
    this.clock = clock;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
    this.tickets = new Map();
    this.rates = new Map();
  }
  prune() {
    const now = this.clock();
    for (const [key, value] of this.sessions) if (value.expires <= now) this.sessions.delete(key);
    for (const [key, value] of this.tickets) if (value.expires <= now) this.tickets.delete(key);
    for (const [key, value] of this.rates) if (value.until <= now) this.rates.delete(key);
  }
  permit(address) {
    this.prune();
    const now = this.clock(),
      bucket = this.rates.get(address) || {count: 0, until: now + 60000};
    if (this.rates.size >= 2048 && !this.rates.has(address)) return false;
    bucket.count++;
    this.rates.set(address, bucket);
    return bucket.count <= 60;
  }
  issue() {
    this.prune();
    if (this.sessions.size >= this.maxSessions)
      throw Error('Guest sessions are full. Try again later.');
    const token = randomBytes(32).toString('base64url'),
      session = {id: randomUUID(), expires: this.clock() + 4 * 60 * 60 * 1000};
    this.sessions.set(token, session);
    return {token, expires: session.expires};
  }
  ticket(token, origin) {
    this.prune();
    const session = this.sessions.get(token);
    if (!session) return null;
    if (this.tickets.size >= 2048) return null;
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(ticket, {session, origin, expires: this.clock() + 30000});
    return {ticket, expires: this.clock() + 30000};
  }
  consume(ticket, origin) {
    if (typeof ticket !== 'string') return null;
    const value = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return value &&
      value.expires > this.clock() &&
      value.session.expires > this.clock() &&
      value.origin === origin
      ? value.session
      : null;
  }
}
