import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { friendlyError } from '../js/utils.js';

const service = await readFile(new URL('../js/services/auth-service.js', import.meta.url), 'utf8');
const moduleSource = service.replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.validationTestClient;');
const { registerStudent, signIn } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const originalFetch = globalThis.fetch;
globalThis.window = { LITERA_CONFIG: { supabaseUrl: 'https://example.test', supabasePublishableKey: 'public-test-key' } };
let confirmations = false;
let signupCalls = 0;
let signouts = 0;
let status = 'PENDING';
globalThis.fetch = async () => ({ ok: true, json: async () => ({ mailer_autoconfirm: confirmations }) });
globalThis.validationTestClient = {
  auth: {
    signUp: async () => { signupCalls++; return { data: { user: { identities: [{}] }, session: {} }, error: null }; },
    signOut: async () => { signouts++; return { error: null }; },
    signInWithPassword: async () => ({ data: { user: { id: 'student-test' } }, error: null })
  },
  from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'student_profiles' ? { status } : null, error: null }) }) }) })
};
try {
  const payload = { fullName: 'Test Student', className: 'X 1', enrollmentYear: '2026', major: 'IPA', email: 'student@example.test', password: 'TestOnly123' };
  await assert.rejects(registerStudent(payload), error => error.code === 'EMAIL_CONFIRMATION_ENABLED');
  assert.equal(signupCalls, 0, 'Confirm-email ON must never reach signup or send email.');
  confirmations = true;
  await registerStudent(payload);
  assert.equal(signupCalls, 1);
  assert.equal(signouts, 1, 'Newly registered users must not keep an active app session.');
  await assert.rejects(signIn(payload.email, payload.password, 'STUDENT'), error => error.code === 'PENDING');
  status = 'REJECTED';
  await assert.rejects(signIn(payload.email, payload.password, 'STUDENT'), error => error.code === 'REJECTED');
  status = 'ACTIVE';
  assert.equal((await signIn(payload.email, payload.password, 'STUDENT')).role, 'STUDENT');
  assert.doesNotMatch(service, /resetPasswordForEmail|signInWithOtp|resend\(/);
  assert.doesNotMatch(friendlyError({ code: 'email_not_confirmed' }), /tautan|kotak masuk/);
  console.log('Admin-only approval, email-free signup guard, and login checks passed.');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.window;
  delete globalThis.validationTestClient;
}
