// Run in a trusted workspace. Input/output are private files, never CLI secret
// arguments or public assets. This script does not configure a cloud account.
import {readFile, mkdir, writeFile, chmod} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {hashAdminPin} from '../server/admin/auth.mjs';
const args = process.argv.slice(2),
  input = args[args.indexOf('--input') + 1],
  out = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : '.admin-setup/secrets.json';
if (!args.includes('--input') || !input) {
  console.error(
    'Usage: node scripts/create-admin-secrets.mjs --input .admin-setup/input.json [--output .admin-setup/secrets.json]',
  );
  process.exit(1);
}
const target = resolve(out);
if (target.includes('/dist/') || target.endsWith('/dist'))
  throw Error('Private settings cannot be written into public assets.');
const values = JSON.parse(await readFile(input, 'utf8'));
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email || '')))
  throw Error('A valid admin email is required.');
const result = {
  ADMIN_PIN_HASH: await hashAdminPin(String(values.pin || '')),
  ADMIN_EMAIL: values.email,
  ADMIN_SECRET: randomBytes(32).toString('base64url'),
};
await mkdir(dirname(target), {recursive: true, mode: 0o700});
await writeFile(target, JSON.stringify(result, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
});
await chmod(target, 0o600);
console.log(
  'Private admin settings created. Add them as server secrets; keep this file outside Git and public assets.',
);
