// Server-only two-step admin authentication. Neither PIN, email nor codes enter
// public assets, URLs or logs. Durable state contains keyed hashes, not secrets.
const encoder = new TextEncoder();
const STATE_KEY = 'admin-auth-v1';
const LOGIN_COOKIE = '__Host-bc_admin_login',
  SESSION_COOKIE = '__Host-bc_admin';
const MINUTE = 60000,
  PIN_WINDOW = 15 * MINUTE,
  CODE_TTL = 5 * MINUTE,
  SESSION_TTL = 15 * MINUTE;
const encode = (data) =>
  btoa(String.fromCharCode(...data))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const decode = (text) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
const random = (bytes = 32) =>
  encode(crypto.getRandomValues(new Uint8Array(bytes)));
function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
function code() {
  const value = new Uint32Array(1),
    limit = Math.floor(2 ** 32 / 1e8) * 1e8;
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return String(value[0] % 1e8).padStart(8, '0');
}
function cookies(header = '') {
  const out = {};
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at > 0) out[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return out;
}
const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
function pinParts(value) {
  const parts = String(value || '').split('$');
  if (
    parts.length !== 4 ||
    parts[0] !== 'pbkdf2-sha256' ||
    parts[1] !== '100000' ||
    !parts.slice(2).every((x) => /^[A-Za-z0-9_-]{20,90}$/.test(x))
  )
    return null;
  try {
    const salt = decode(parts[2]),
      hash = decode(parts[3]);
    return salt.length === 16 && hash.length === 32 ? {salt, hash} : null;
  } catch {
    return null;
  }
}
export async function hashAdminPin(pin) {
  if (!/^\d{4,12}$/.test(pin)) throw Error('Use a 4–12 digit PIN.');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
  const bits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000},
    key,
    256,
  );
  return `pbkdf2-sha256$100000$${encode(salt)}$${encode(new Uint8Array(bits))}`;
}
export class MemoryAdminStore {
  constructor() {
    this.value = undefined;
  }
  async get() {
    return structuredClone(this.value);
  }
  async put(key, value) {
    this.value = structuredClone(value);
  }
}
export class AdminAuth {
  constructor({
    pinHash = '',
    email = '',
    secret = '',
    store = new MemoryAdminStore(),
    sendMail = null,
    clock = Date.now,
  } = {}) {
    this.pin = pinParts(pinHash);
    this.email = String(email);
    this.secret = String(secret);
    this.store = store;
    this.sendMail = sendMail;
    this.clock = clock;
    this.pending = Promise.resolve();
    this.ready = !!(
      this.pin &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email) &&
      this.secret.length >= 43 &&
      sendMail
    );
  }
  async keyed(value) {
    this.key ??= crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secret),
      {name: 'HMAC', hash: 'SHA-256'},
      false,
      ['sign'],
    );
    return encode(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', await this.key, encoder.encode(value)),
      ),
    );
  }
  async verifyPin(pin) {
    if (!/^\d{4,12}$/.test(pin)) return false;
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
      ),
      bits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: this.pin.salt,
          iterations: 100000,
        },
        key,
        256,
      );
    return equal(new Uint8Array(bits), this.pin.hash);
  }
  async transaction(operation) {
    const task = this.pending.then(async () => {
      const state = (await this.store.get(STATE_KEY)) || {
        pins: {},
        global: [],
        mail: [],
        challenges: {},
        sessions: {},
      };
      const now = this.clock();
      state.global = state.global.filter((t) => t > now - PIN_WINDOW);
      state.mail = state.mail.filter((t) => t > now - 60 * MINUTE);
      for (const [key, value] of Object.entries(state.pins)) {
        state.pins[key] = value.filter((t) => t > now - PIN_WINDOW);
        if (!state.pins[key].length) delete state.pins[key];
      }
      for (const group of [state.challenges, state.sessions])
        for (const [key, value] of Object.entries(group))
          if (value.expires <= now) delete group[key];
      const result = await operation(state, now);
      await this.store.put(STATE_KEY, state);
      return result;
    });
    this.pending = task.catch(() => {});
    return task;
  }
  async authenticated(header) {
    if (!this.ready) return false;
    const token = cookies(header)[SESSION_COOKIE];
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return false;
    const key = await this.keyed('session:' + token);
    return this.transaction((state) => !!state.sessions[key]);
  }
  async handle({
    method,
    path,
    origin,
    serverOrigin,
    cookieHeader = '',
    address = 'unknown',
    body = {},
  }) {
    const reply = (status, data, setCookies = []) => ({
      status,
      data,
      setCookies,
    });
    if (path === '/api/admin/session' && method === 'GET')
      return reply(200, {
        enabled: this.ready,
        authenticated: await this.authenticated(cookieHeader),
      });
    if (!this.ready)
      return reply(503, {
        error:
          'Admin login is locked until its private server configuration and email delivery are set up.',
      });
    if (method !== 'POST') return reply(405, {error: 'Use POST.'});
    if (origin !== serverOrigin)
      return reply(403, {error: 'Open admin login on the game server itself.'});
    if (path === '/api/admin/request-code') {
      const addressKey = await this.keyed('address:' + address);
      return this.transaction(async (state, now) => {
        const attempts = state.pins[addressKey] || [];
        if (
          attempts.length >= 5 ||
          state.global.length >= 30 ||
          (!state.pins[addressKey] && Object.keys(state.pins).length >= 256)
        )
          return reply(429, {
            error: 'Too many login attempts. Try again in 15 minutes.',
          });
        (state.pins[addressKey] ??= []).push(now);
        state.global.push(now);
        if (!(await this.verifyPin(String(body.pin || ''))))
          return reply(401, {error: 'The PIN could not be verified.'});
        if (
          state.mail.length >= 5 ||
          (state.mail.length && now - state.mail.at(-1) < MINUTE)
        )
          return reply(429, {
            error:
              'A code was requested recently. Wait before requesting another.',
          });
        const binding = random(),
          otp = code(),
          key = await this.keyed('challenge:' + binding);
        // At most five outstanding challenges; mail is globally throttled too.
        state.challenges[key] = {
          digest: await this.keyed('code:' + key + ':' + otp),
          expires: now + CODE_TTL,
          attempts: 0,
        };
        state.mail.push(now);
        try {
          await this.sendMail({to: this.email, code: otp, expiresMinutes: 5});
        } catch {
          delete state.challenges[key];
          return reply(503, {
            error:
              'The code could not be sent. Check the private email-service configuration.',
          });
        }
        return reply(202, {sent: true, expiresIn: CODE_TTL / 1000}, [
          cookie(LOGIN_COOKIE, binding, CODE_TTL / 1000),
        ]);
      });
    }
    if (path === '/api/admin/verify-code') {
      const binding = cookies(cookieHeader)[LOGIN_COOKIE],
        key = await this.keyed('challenge:' + String(binding || ''));
      return this.transaction(async (state, now) => {
        const challenge = state.challenges[key];
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(binding || '') ||
          !challenge ||
          challenge.attempts >= 5
        )
          return reply(401, {
            error: 'The code is invalid or expired. Request a new code.',
          });
        challenge.attempts++;
        const digest = await this.keyed(
          'code:' + key + ':' + String(body.code || ''),
        );
        if (
          !/^\d{8}$/.test(String(body.code || '')) ||
          !equal(encoder.encode(digest), encoder.encode(challenge.digest))
        ) {
          if (challenge.attempts >= 5) delete state.challenges[key];
          return reply(401, {
            error: 'The code is invalid or expired. Request a new code.',
          });
        }
        delete state.challenges[key];
        const token = random(),
          sessionKey = await this.keyed('session:' + token);
        while (Object.keys(state.sessions).length >= 4)
          delete state.sessions[Object.keys(state.sessions)[0]];
        state.sessions[sessionKey] = {expires: now + SESSION_TTL};
        return reply(
          200,
          {authenticated: true, expiresIn: SESSION_TTL / 1000},
          [
            cookie(SESSION_COOKIE, token, SESSION_TTL / 1000),
            cookie(LOGIN_COOKIE, '', 0),
          ],
        );
      });
    }
    if (path === '/api/admin/logout') {
      const key = await this.keyed(
        'session:' + String(cookies(cookieHeader)[SESSION_COOKIE] || ''),
      );
      await this.transaction((state) => {
        delete state.sessions[key];
      });
      return reply(200, {authenticated: false}, [
        cookie(SESSION_COOKIE, '', 0),
        cookie(LOGIN_COOKIE, '', 0),
      ]);
    }
    return reply(404, {error: 'Not found.'});
  }
}
