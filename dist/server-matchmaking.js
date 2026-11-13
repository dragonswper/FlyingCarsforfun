import {DedicatedRoom} from './dedicated-room.js';
export class DedicatedMatchmaker {
  constructor({
    address,
    Room = DedicatedRoom,
    prepareBodies = async () => {},
    onChange = () => {},
    onRoomChange = () => {},
    onLobby = () => {},
    onMatch = () => {},
    onDisconnect = () => {},
    onEvents = () => {},
    onChat = () => {},
    onChatState = () => {}
  } = {}) {
    Object.assign(this, {
      address,
      Room,
      prepareBodies,
      onChange,
      onRoomChange,
      onLobby,
      onMatch,
      onDisconnect,
      onEvents,
      onChat,
      onChatState
    });
    this.finished = false;
  }
  start(look, options = {}) {
    try {
      const session = new this.Room({
        address: this.address,
        prepare: this.prepareBodies,
        onQueue: (state) => {
          if (!this.finished) this.onChange(state);
        },
        onChange: (room) => {
          if (this.finished) this.onRoomChange(room);
          else if (room.admitted && room.options.mode === 'custom') {
            this.finished = true;
            this.onLobby(room);
          } else if (['starting', 'lobby'].includes(room.status))
            this.onChange({phase: 'preparing', reason: 'Preparing all selected vehicles…'});
        },
        onMatch: (sim) => {
          // Search has ended, but this session still owns subsequent rematches.
          // PartyRoom.present already suppresses duplicate match IDs.
          if (session.closed) return;
          this.finished = true;
          this.onMatch(sim, session);
        },
        onEvents: (events) => this.onEvents(events, session),
        onChat: this.onChat,
        onChatState: this.onChatState,
        onDisconnect: (reason) => {
          if (this.finished) this.onDisconnect(reason, session);
          else {
            this.onChange({phase: 'cancelled', reason});
            this.cancel();
          }
        }
      });
      this.session = session;
      this.onChange({
        phase: 'connecting',
        reason:
          'Connecting to the secure game server. A free server may need about a minute to wake.'
      });
      session.matchmake(look, options, options.network);
      return true;
    } catch (error) {
      this.onChange({phase: 'cancelled', reason: error.message});
      this.cancel();
      return false;
    }
  }
  cancel() {
    if (this.finished) return;
    this.finished = true;
    this.session?.close();
  }
}
