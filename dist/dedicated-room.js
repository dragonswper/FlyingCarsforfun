import {PartyRoom} from './party-room.js';
import {ServerLink, serverEndpoint} from './server-link.js';
import {NET_BUILD, appearance} from './network-protocol.js';
import {serverOptions} from './server-options.js';
import {ServerCredentials} from './server-auth.js';
import {networkPreferences, assessConnection} from './network-quality.js';
export const serverCode = (value) => {
  const code = String(value || '').trim();
  if (!/^BCS-[A-Za-z0-9_-]{22}$/.test(code))
    throw Error(
      'Enter the complete BCS dedicated-server invite. Both players must use the same server URL.'
    );
  return code;
};
export function parseServerInvite(value) {
  const raw = String(value || '').trim(),
    split = raw.indexOf('@');
  let address = '';
  try {
    if (split >= 0) address = decodeURIComponent(raw.slice(split + 1));
  } catch {
    throw Error('The server address in this invite is invalid.');
  }
  if (address.length > 500) throw Error('The server address is too long.');
  return {code: serverCode(split < 0 ? raw : raw.slice(0, split)), address};
}
export class DedicatedRoom extends PartyRoom {
  constructor({address, Link = ServerLink, credentials, onQueue = () => {}, ...options} = {}) {
    super(options);
    this.address = serverEndpoint(address);
    this.Link = Link;
    this.credentials = credentials || new ServerCredentials(this.address);
    this.onQueue = onQueue;
    this.dedicated = true;
    this.role = 'guest';
    this.ownerId = null;
  }
  normalizeOptions(value) {
    return serverOptions(value);
  }
  get invite() {
    return this.code ? this.code + '@' + encodeURIComponent(this.address) : '';
  }
  get canManage() {
    return !this.matchmade && this.id !== undefined && this.id === this.ownerId;
  }
  get connectionInfo() {
    return this.link?.connectionInfo;
  }
  create(options, look) {
    this.options = serverOptions(options);
    this.look = appearance(look);
    this.startConnection({t: 'server-create', options: this.options});
  }
  matchmake(look, options = {}, network = {}) {
    this.matchmade = true;
    this.options = serverOptions(options);
    this.look = appearance(look);
    this.preferences = networkPreferences(network);
    this.startConnection({t: 'server-queue', options: this.options, network: this.preferences});
  }
  join(code, look) {
    this.code = parseServerInvite(code).code;
    this.look = appearance(look);
    this.startConnection({t: 'server-join', code: this.code});
  }
  startConnection(request) {
    this.change('connecting');
    this.dial(request);
    this.beat();
    this.later(() => {
      if (!this.admitted)
        this.fail('The dedicated server did not admit this connection. Check its URL and invite.');
    }, 160000);
  }
  async dial(request) {
    if (this.closed) return;
    let link;
    const generation = (this.dialGeneration = (this.dialGeneration || 0) + 1),
      current = () => !this.closed && generation === this.dialGeneration;
    try {
      const ticket = await this.credentials.ticket();
      if (!current()) return;
      this.request = request;
      link = new this.Link(this.address, {
        onOpen: () => {
          if (current()) link.send({t: 'server-auth', build: NET_BUILD, ticket});
        },
        onPacket: (packet) => {
          if (current() && this.link === link) this.serverPacket(packet);
        },
        onClose: () => {
          if (current() && this.link === link) this.lostHost();
        }
      });
      this.link = link;
    } catch {
      if (!current()) return;
      if (this.recovering) this.recoverLink();
      else
        this.fail(
          'Could not authenticate with the secure server. Check its URL; a free server may need a minute to wake.'
        );
    }
  }
  sendRequest() {
    this.link.send({
      ...this.request,
      build: NET_BUILD,
      look: this.look,
      matchId: this.matchId || null
    });
  }
  measure() {
    const id = (this.measureId || 0) + 1;
    this.measureId = id;
    this.measureAt = this.clock();
    this.link.send({t: 'server-measure', id});
    this.later(() => {
      if (this.measureId === id && this.measureAt !== null && !this.admitted)
        this.fail('The server ping check timed out. Please reconnect.');
    }, 5000);
  }
  serverPacket(packet) {
    if (packet.t === 'server-authenticated') {
      if (packet.build !== NET_BUILD) {
        this.fail('The server game version differs. Reload the game.');
        return;
      }
      if (this.request.t === 'server-queue') {
        this.onQueue({phase: 'checking', reason: 'Measuring your connection to the game server…'});
        this.measureSamples = [];
        this.measure();
      } else this.sendRequest();
      return;
    }
    if (packet.t === 'server-measured' && packet.id === this.measureId && this.measureAt !== null) {
      this.measureSamples.push(this.clock() - this.measureAt);
      this.measureAt = null;
      if (this.measureSamples.length < 3) {
        this.later(() => this.measure(), 50);
        return;
      }
      const report = assessConnection(this.measureSamples, this.preferences);
      this.connectionReport = report;
      this.replica?.setLatency(report.ping);
      if (!report.accepted) {
        this.fail(
          'Server ping ' +
            report.ping +
            ' ms exceeds your enforced limit. Choose Warn and Connect or another server.'
        );
        return;
      }
      this.sendRequest();
      return;
    }
    if (packet.t === 'server-queue') {
      this.queueState = packet;
      this.onQueue({...packet, connection: this.connectionReport});
      return;
    }
    if (packet.t === 'server-error') {
      this.fail(packet.message || 'The dedicated server could not admit this connection.');
      return;
    }
    if (packet.t === 'server-welcome') {
      if (
        packet.build !== NET_BUILD ||
        typeof packet.key !== 'string' ||
        !/^[a-f0-9]{32}$/.test(packet.key) ||
        typeof packet.token !== 'string' ||
        !/^[a-f0-9]{32}$/.test(packet.token) ||
        !Number.isInteger(packet.selfId) ||
        packet.selfId < 0 ||
        packet.selfId > 7
      ) {
        this.fail('The dedicated server response could not be verified.');
        return;
      }
      try {
        this.code = serverCode(packet.code);
      } catch {
        this.fail('The dedicated server returned an invalid invite.');
        return;
      }
      this.id = packet.selfId;
      this.key = packet.key;
      this.token = packet.token;
      this.ownerId = packet.ownerId;
      this.matchmade = packet.matchmade === true;
      if (this.recovering && (!this.matchId || packet.matchId !== this.matchId)) {
        this.recovering = false;
        this.matchId = null;
        this.presentedMatch = null;
        this.sim = null;
        this.admitted = false;
      }
      this.change();
      return;
    }
    if (packet.t === 'server-owner') {
      this.ownerId = packet.ownerId;
      this.change();
      return;
    }
    this.receiveGuest(packet);
  }
  configure(options) {
    return this.canManage && this.connected
      ? this.link.send({t: 'server-configure', options: serverOptions(options)})
      : false;
  }
  practice(action) {
    return this.active && ['reset', 'next'].includes(action)
      ? this.link.send({t: 'practice', action, matchId: this.matchId})
      : false;
  }
  startMatch() {
    return this.canManage && this.connected ? this.link.send({t: 'server-start'}) : false;
  }
  lostHost() {
    if (this.closed) return;
    if (!this.admitted) {
      this.fail('The server connection was interrupted. Please search or join again.');
      return;
    }
    const old = this.link;
    this.link = null;
    old?.close();
    if (!this.recovering) {
      this.recovering = true;
      this.recoveryDeadline = this.clock() + 20000;
      if (this.replica) {
        this.replica.pending.length = 0;
        this.replica.paused = true;
      }
    }
    this.change('reconnecting');
    this.recoverLink();
  }
  recoverLink() {
    if (this.closed || !this.recovering || this.retryScheduled) return;
    if (this.clock() >= this.recoveryDeadline) {
      this.fail('The dedicated server could not reconnect within 20 seconds.');
      return;
    }
    this.retryScheduled = true;
    this.later(() => {
      this.retryScheduled = false;
      if (!this.closed && this.recovering) this.dial({t: 'server-resume', code: this.code});
    }, 500);
  }
  retryRecovery() {
    const old = this.link;
    this.link = null;
    old?.close();
    this.resumeReady = false;
    this.recoverLink();
  }
}
