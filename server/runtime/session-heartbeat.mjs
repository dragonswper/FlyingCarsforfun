// Menus may be backgrounded while a friend accepts an invitation. Keep the
// existing 3-second live-match watchdog, but allow a minute of lobby inactivity.
export function sessionHeartbeat(room) {
  if (room.closed) return;
  const now = room.clock(),
    active = !!room.matchId && room.sim?.phase !== 'ended',
    timeout = active ? 3000 : 60000;
  for (const entry of room.entries.values()) {
    if (entry.recovering) {
      if (now >= entry.deadline)
        room.remove(entry.id, 'The player could not reconnect in 20 seconds.');
      continue;
    }
    if (entry.link?.open) {
      entry.link.refreshStats?.();
      if (now - entry.lastReceive > timeout) {
        room.lostPeer(entry);
        continue;
      }
      room.ping(entry);
      entry.link.send({t: 'probe'}, true);
    }
  }
  const connected = [...room.entries.values()].filter(
    (entry) => entry.link?.open && !entry.recovering,
  );
  room.recovering =
    !!room.matchId && room.entries.size > 0 && !connected.length;
  room.recoveryDeadline = Math.max(
    0,
    ...[...room.entries.values()].map((entry) => entry.deadline || 0),
  );
  if (connected.length) {
    const worst = connected.sort(
      (a, b) =>
        (b.quality.summary(now, b.lastRealtimeAt).ping || 0) -
        (a.quality.summary(now, a.lastRealtimeAt).ping || 0),
    )[0];
    room.quality = worst.quality;
    room.lastReceive = worst.lastReceive;
    room.lastRealtimeAt = worst.lastRealtimeAt;
  }
  room.change();
  if (!room.closed) room.later(() => room.beat(), 1000);
}
