export function setupLobbyPartyUI({manage, invite, leave}, root = document) {
  const panel = root.getElementById('lobby-party'),
    list = root.getElementById('lobby-party-members');
  let previous = '';
  root.getElementById('lobby-party-manage').addEventListener('click', manage);
  root.getElementById('lobby-party-invite').addEventListener('click', invite);
  root.getElementById('lobby-party-leave').addEventListener('click', leave);
  return {
    render(members = [], selfId, ownerId, capacity = 8, recovering = false) {
      const signature = JSON.stringify([
        members.map((m) => [m.id, m.look?.name, m.connected]),
        selfId,
        ownerId,
        capacity,
        recovering,
      ]);
      if (signature === previous) return;
      previous = signature;
      root.body?.classList.toggle('shared-lobby', members.length > 0);
      panel.hidden = !members.length;
      list.replaceChildren();
      root.getElementById('lobby-party-count').textContent = recovering
        ? 'RECONNECTING…'
        : members.length + '/' + capacity;
      for (const member of members) {
        const row = root.createElement('li'),
          name = root.createElement('strong'),
          status = root.createElement('small');
        name.textContent = member.look?.name || 'Driver';
        status.textContent =
          [
            member.id === selfId ? 'YOU' : '',
            member.id === ownerId ? 'HOST' : '',
            member.connected === false ? 'RECONNECTING' : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'IN LOBBY';
        row.append(name, status);
        list.append(row);
      }
    },
  };
}
