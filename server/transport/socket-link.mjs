import {Buffer} from 'node:buffer';
import {MAX_PACKET} from '../../dist/network-protocol.js';
import {snapshotForPeer} from '../../dist/snapshot-wire.js';

export class SocketLink {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this.closed = false;
    this.wire = 0;
  }
  send(packet, realtime = false) {
    if (
      this.closed ||
      !this.open ||
      this.socket.readyState !== 1 ||
      this.socket.bufferedAmount > (realtime ? 8192 : 65536)
    )
      return false;
    const sequence = this.wire + 1,
      data = JSON.stringify(realtime ? {...packet, w: sequence} : packet);
    if (Buffer.byteLength(data) > MAX_PACKET) return false;
    try {
      this.socket.send(data);
      if (realtime) this.wire = sequence;
      return true;
    } catch {
      return false;
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.socket.close();
  }
  sendSnapshot(world, state) {
    if (
      this.closed ||
      !this.open ||
      this.socket.readyState !== 1 ||
      this.socket.bufferedAmount > Math.max(2048, world.byteLength * 2)
    )
      return false;
    const wire = this.wire + 1,
      bytes = snapshotForPeer(world, {
        n: state.n,
        ack: state.ack,
        w: wire,
        net: state.net,
      });
    try {
      this.socket.send(bytes);
      this.wire = wire;
      return true;
    } catch {
      return false;
    }
  }
}
