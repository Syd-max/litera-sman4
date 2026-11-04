export const MIN_ENROLLMENT_YEAR = 2024;

export function enrollmentYears(now = new Date()) {
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric" }).format(now));
  return Array.from({ length: Math.max(0, currentYear - MIN_ENROLLMENT_YEAR + 1) }, (_, index) => MIN_ENROLLMENT_YEAR + index);
}

export function studentAccessExpiresAt(profile) {
  if (profile?.access_expires_at) return new Date(profile.access_expires_at).getTime();
  const year = Number(profile?.enrollment_year);
  // Legacy years need review; never infer graduation or delete them automatically.
  if (!Number.isInteger(year) || year < MIN_ENROLLMENT_YEAR || year > 2100) return null;
  return Date.parse(`${year + 3}-07-01T00:00:00+07:00`);
}

export function isStudentAccessExpired(profile, now = Date.now()) {
  const expiry = studentAccessExpiresAt(profile);
  return profile?.status === "EXPIRED" || (expiry !== null && expiry <= now);
}

export function studentAccountCleanupAt(profile) {
  const expiry = studentAccessExpiresAt(profile);
  if (expiry === null || !Number.isFinite(expiry)) return null;
  const eligibleAt = expiry + 7 * 86400000;
  const date = new Date(eligibleAt);
  // Matches litera-cleanup-alumni: 17:15 UTC is 00:15 WIB the next day.
  const scheduledAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 17, 15);
  return scheduledAt < eligibleAt ? scheduledAt + 86400000 : scheduledAt;
}
