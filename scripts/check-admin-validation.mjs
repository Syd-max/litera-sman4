import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { friendlyError } from '../js/utils.js';
import { enrollmentYears } from '../js/account-lifecycle.js';

const service = await readFile(new URL('../js/services/auth-service.js', import.meta.url), 'utf8');
const moduleSource = service.replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.validationTestClient;')
  .replace('"../account-lifecycle.js"', JSON.stringify(new URL('../js/account-lifecycle.js', import.meta.url).href))
  .replace('import { uploadRegistrationSelfie } from "./selfie-service.js";', 'const uploadRegistrationSelfie = async () => globalThis.validationTestUpload();');
const { registerStudent, signIn } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const originalFetch = globalThis.fetch;
globalThis.window = { LITERA_CONFIG: { supabaseUrl: 'https://example.test', supabasePublishableKey: 'public-test-key' } };
let confirmations = false;
let signupCalls = 0;
let signouts = 0;
let status = 'PENDING';
let failUpload = false;
let uploads = 0;
globalThis.validationTestUpload = async () => { if (failUpload) throw new Error('Upload interrupted'); uploads++; };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ mailer_autoconfirm: confirmations }) });
globalThis.validationTestClient = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signUp: async () => { signupCalls++; return { data: { user: { identities: [{}] }, session: {} }, error: null }; },
    signOut: async () => { signouts++; return { error: null }; },
    signInWithPassword: async () => ({ data: { user: { id: 'student-test' }, session: {} }, error: null })
  },
  from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'student_profiles' ? { status } : null, error: null }) }) }) })
};
try {
  const payload = { fullName: 'Test Student', className: 'X 1', enrollmentYear: String(enrollmentYears().at(-1)), major: 'IPA', email: 'student@example.test', password: 'TestOnly123', selfie: { blob: { size: 100, type: 'image/webp' }, capturedAt: new Date().toISOString() } };
  await assert.rejects(registerStudent({ ...payload, selfie: null }), error => error.code === 'SELFIE_ERROR');
  await assert.rejects(registerStudent(payload), error => error.code === 'EMAIL_CONFIRMATION_ENABLED');
  assert.equal(signupCalls, 0, 'Confirm-email ON must never reach signup or send email.');
  confirmations = true;
  await registerStudent(payload);
  assert.equal(signupCalls, 1);
  assert.equal(signouts, 1, 'Newly registered users must not keep an active app session.');
  failUpload = true;
  await assert.rejects(registerStudent(payload), error => error.code === 'SELFIE_UPLOAD_RETRY');
  const createdBeforeRetry = signupCalls;
  failUpload = false;
  await registerStudent(payload);
  assert.equal(signupCalls, createdBeforeRetry, 'Retrying a failed selfie upload must not create another account.');
  const signup = globalThis.validationTestClient.auth.signUp;
  globalThis.validationTestClient.auth.signUp = async () => ({ data: {}, error: { code: 'user_already_exists', message: 'User already registered' } });
  const uploadsBeforeResume = uploads;
  await registerStudent(payload);
  assert.equal(uploads, uploadsBeforeResume + 1, 'An existing pending account can resume selfie capture after login verification.');
  status = 'ACTIVE';
  assert.ok((await registerStudent(payload)).error);
  assert.equal(uploads, uploadsBeforeResume + 1, 'Existing active accounts must not enter registration selfie upload.');
  globalThis.validationTestClient.auth.signUp = signup;
  status = 'PENDING';
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
  delete globalThis.validationTestUpload;
}
