const node = (id) => document.getElementById(id);
let busy = false;
const screens = ['pin-form', 'code-form', 'dashboard', 'setup'];
function screen(id) {
  for (const name of screens) node(name).hidden = name !== id;
}
function status(message) {
  node('status').textContent = message;
}
async function request(path, body) {
  const response = await fetch('/api/admin/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? {} : {'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error('The secure server could not be reached.');
  }
  if (!response.ok) {
    const e = new Error(data.error || 'Admin request failed.');
    e.status = response.status;
    throw e;
  }
  return data;
}
async function action(operation) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await operation();
  } catch (error) {
    status(error.message);
    if (error.status === 401 && node('code-form').hidden) screen('pin-form');
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}
async function overview() {
  const data = await request('overview');
  screen('dashboard');
  node('metrics').replaceChildren();
  const rows = [
    ['Build', data.build],
    ['Open rooms', data.rooms],
    ['Queued groups', data.queued],
    ['Physics rate', data.capabilities.physicsHz + ' Hz'],
    ['Snapshot rate', data.capabilities.snapshotHz + ' Hz'],
    ['Callback p95', data.runtime.callbackP95Ms + ' ms'],
    ['Discarded time', data.runtime.discardedMs + ' ms'],
    ['Simulation debt', data.runtime.debtMs + ' ms'],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt'),
      dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = String(value);
    node('metrics').append(dt, dd);
  }
  status('Signed in. This session expires after 15 minutes.');
}
node('pin-form').onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const pin = node('pin').value;
    node('pin').value = '';
    await request('request-code', {pin});
    screen('code-form');
    status('A one-time code was sent to the configured admin email.');
    node('code').focus();
  });
};
node('code-form').onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const code = node('code').value;
    node('code').value = '';
    await request('verify-code', {code});
    await overview();
  });
};
node('restart').onclick = () => {
  node('code').value = '';
  screen('pin-form');
  status('Enter your PIN to request a new code. Requests are rate limited.');
  node('pin').focus();
};
node('refresh').onclick = () => action(overview);
node('logout').onclick = () =>
  action(async () => {
    await request('logout', {});
    screen('pin-form');
    status('Signed out.');
  });
window.addEventListener('pagehide', () => {
  node('pin').value = '';
  node('code').value = '';
});
await action(async () => {
  const session = await request('session');
  if (!session.enabled) {
    screen('setup');
    status('Admin login is locked until private server setup is complete.');
  } else if (session.authenticated) await overview();
  else {
    screen('pin-form');
    status('Enter your PIN to request a sign-in code.');
  }
});
