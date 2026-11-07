import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = (await readFile(new URL('../js/pages/auth-pages.js', import.meta.url), 'utf8'))
  .replace(/^import .+;\r?\n/gm, '');
const supabaseSource = await readFile(new URL('../js/services/supabase.js', import.meta.url), 'utf8');
const storageModule = await import(`data:text/javascript;base64,${Buffer.from(supabaseSource + '\nexport {getAuthStorageKey};').toString('base64')}`);
const student = { role: 'STUDENT', profile: { status: 'ACTIVE' } };
const librarian = { role: 'LIBRARIAN', profile: {} };
let index = 0;

async function check(page, identity, search = '', fail = false) {
  const links = [false, true].map(button => ({
    href: '', textContent: '', setAttribute() {}, classList: { contains: name => button && name === 'forgot-login' }
  }));
  const redirects = [];
  const toasts = [], historyChanges = [];
  const handlers = {};
  globalThis.window = {
    location: { pathname: `/${page === 'student-login' ? 'index' : page}.html`, search, hash: '#login', replace: target => redirects.push(target) },
    history: { state: null, replaceState: (_, __, target) => historyChanges.push(target) },
    addEventListener: (name, handler) => { handlers[name] = handler; }
  };
  globalThis.document = {
    body: { dataset: { page } },
    querySelectorAll: selector => selector === '[data-auth-back]' ? links : [],
    querySelector: () => ({ addEventListener() {} })
  };
  globalThis.navigationCase = { toasts, readIdentity: async () => { if (fail) throw new Error('network unavailable'); return identity; } };
  const source = `import { isStudentAccessExpired } from ${JSON.stringify(new URL('../js/account-lifecycle.js', import.meta.url).href)};\nimport { initializePasswordToggles } from ${JSON.stringify(new URL('../js/components/password-toggle.js', import.meta.url).href)};\nconst getCurrentIdentity = () => globalThis.navigationCase.readIdentity(); const showToast = message => globalThis.navigationCase.toasts.push(message);\n` + pageSource;
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#case-${index++}`);
  await module.restoreAuthNavigation();
  return { links, redirects, handlers, toasts, historyChanges };
}

try {
  let result = await check('forgot-password', student);
  assert.ok(result.links.every(link => link.href === './student/profile.html'));
  assert.equal(result.links[1].textContent, 'Kembali ke Akun');
  assert.equal(result.redirects.length, 0);
  result = await check('forgot-password', librarian, '?portal=admin');
  assert.ok(result.links.every(link => link.href === './librarian/index.html'));
  assert.equal(storageModule.getAuthStorageKey(), 'litera-admin-auth');
  result = await check('forgot-password', null, '?portal=admin');
  assert.ok(result.links.every(link => link.href === './admin-login.html'));
  result = await check('forgot-password', null);
  assert.ok(result.links.every(link => link.href === './index.html'));
  assert.equal(storageModule.getAuthStorageKey(), 'litera-student-auth');
  result = await check('student-login', student);
  assert.ok(result.redirects.includes('./student/index.html'));
  result.redirects.length = 0;
  result.handlers.pageshow({ persisted: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(result.redirects, ['./student/index.html']);
  result = await check('admin-login', librarian);
  assert.ok(result.redirects.includes('./librarian/index.html'));
  for (const status of ['PENDING', 'REJECTED', 'SUSPENDED', 'EXPIRED']) {
    result = await check('student-login', { role: 'STUDENT', profile: { status } });
    assert.equal(result.redirects.length, 0);
  }
  result = await check('student-login', { role: 'STUDENT', profile: { status: 'ACTIVE', access_expires_at: '2020-01-01T00:00:00Z' } });
  assert.equal(result.redirects.length, 0);
  result = await check('student-login', student, '', true);
  assert.equal(result.redirects.length, 0);
  result = await check('student-login', null, '?account=expired&keep=value');
  assert.match(result.toasts[0], /Masa aktif/);
  assert.deepEqual(result.historyChanges, ['/index.html?keep=value#login'], 'Consume the old expiry message without changing other query parameters');
  result = await check('student-login', null);
  assert.equal(result.toasts.length, 0, 'Returning to login must not repeat an old expired-account message');
  console.log('Back navigation, active-session redirects, portal isolation, and browser history checks passed.');
} finally {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.navigationCase;
}
