import { TeamMember } from '@/types/hunt';

// Shared by the login page and /api/auth/login so both enforce the same rules

export const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/; // letters only, single spaces between words
export const PHONE_PATTERN = /^\d{10}$/;
export const REG_NO_PATTERN = /^[A-Za-z0-9]+$/;

export const REQUIRED_BASE_DECODERS = 2;
export const MAX_FIELD_SCOUTS = 3;
export const MIN_MEMBERS = 4;
export const MAX_MEMBERS = 5;

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}

export function validatePersonName(value: string, label: string): string {
  const name = normalizeName(value);
  if (!name) return `${label} is required.`;
  if (name.length < 2) return `${label} must be at least 2 characters.`;
  if (!NAME_PATTERN.test(name)) return `${label} can contain only letters and spaces.`;
  return '';
}

// Returns the first problem with the roster, or '' when it is valid
export function validateMembers(members: unknown): string {
  if (!Array.isArray(members) || members.length < MIN_MEMBERS || members.length > MAX_MEMBERS) {
    return `TEAMS MUST HAVE ${MIN_MEMBERS} OR ${MAX_MEMBERS} MEMBERS.`;
  }

  let decoders = 0;
  let scouts = 0;
  const seenRegNos = new Set<string>();
  const seenPhones = new Set<string>();

  for (let i = 0; i < members.length; i++) {
    const m = members[i] as Partial<TeamMember> | null;
    const n = i + 1;
    if (!m || typeof m !== 'object') return `MEMBER ${n}: INVALID ENTRY.`;

    const nameErr = validatePersonName(String(m.name ?? ''), `Member ${n} name`);
    if (nameErr) return nameErr.toUpperCase();

    const regNo = String(m.regNo ?? '').trim().toUpperCase();
    if (!REG_NO_PATTERN.test(regNo)) return `MEMBER ${n}: REG NO MUST BE ALPHANUMERIC (LETTERS AND DIGITS ONLY).`;
    if (seenRegNos.has(regNo)) {
      return `MEMBER ${n}: REGISTRATION NUMBER "${regNo}" IS DUPLICATE IN THIS TEAM.`;
    }
    seenRegNos.add(regNo);

    const phone = String(m.phone ?? '').trim();
    if (!PHONE_PATTERN.test(phone)) return `MEMBER ${n}: PHONE NUMBER MUST BE EXACTLY 10 DIGITS.`;
    if (seenPhones.has(phone)) {
      return `MEMBER ${n}: PHONE NUMBER "${phone}" IS DUPLICATE IN THIS TEAM.`;
    }
    seenPhones.add(phone);

    if (m.role === 'Base Decoder') decoders++;
    else if (m.role === 'Field Scout') scouts++;
    else return `MEMBER ${n}: INVALID ROLE.`;
  }

  if (decoders !== REQUIRED_BASE_DECODERS) {
    return `TEAM MUST HAVE EXACTLY ${REQUIRED_BASE_DECODERS} BASE DECODERS.`;
  }
  if (scouts > MAX_FIELD_SCOUTS) {
    return `TEAM CAN HAVE AT MOST ${MAX_FIELD_SCOUTS} FIELD SCOUTS.`;
  }
  return '';
}

