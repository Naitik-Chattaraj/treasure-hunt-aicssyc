import { SignJWT, jwtVerify } from 'jose';

const MIN_SECRET_LENGTH = 32;
let cachedSecret: Uint8Array | null = null;

// Read lazily so builds work without the env var, but never fall back to a default:
// a secret committed to the repo would let anyone forge admin and team tokens.
function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.ADMIN_JWT_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`ADMIN_JWT_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters`);
  }

  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export interface TeamJWTPayload {
  teamId: string;
  uid: string;
  teamName: string;
  assignedRoute?: 1 | 2;
  operativeName?: string;
  operativeRole?: 'Field Scout' | 'Base Decoder';
  deviceId?: string;
}

export async function signTeamToken(payload: TeamJWTPayload): Promise<string> {
  return await new SignJWT({ ...payload, role: 'team' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyTeamToken(token: string): Promise<TeamJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.role !== 'team') return null;
    return {
      teamId: payload.teamId as string,
      uid: payload.uid as string,
      teamName: payload.teamName as string,
      assignedRoute: (payload.assignedRoute === 2 ? 2 : 1) as 1 | 2,
      operativeName: payload.operativeName as string | undefined,
      operativeRole: payload.operativeRole as ('Field Scout' | 'Base Decoder') | undefined,
      deviceId: payload.deviceId as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function signAdminToken(): Promise<string> {
  return await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(getJwtSecret());
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Strictly verifies that the current device token matches the active session registered
 * in the database for the user's specific operative role (Field Scout or Base Decoder).
 * If a new device logs in under the same role, the previous device's ID will no longer match
 * and will immediately be invalidated (401 session expired).
 */
export function isRoleSessionValid(
  teamDeviceId: string | null | undefined,
  payloadDeviceId: string | undefined,
  operativeRole: 'Field Scout' | 'Base Decoder' | undefined
): boolean {
  if (!payloadDeviceId || !teamDeviceId) {
    return false;
  }

  const roleKey = operativeRole === 'Field Scout' ? 'scout' : 'decoder';

  if (teamDeviceId.startsWith('{')) {
    try {
      const parsed = JSON.parse(teamDeviceId);
      // The registered deviceId in DB for this role must match the token's deviceId
      return Boolean(parsed[roleKey] && parsed[roleKey] === payloadDeviceId);
    } catch {
      return false;
    }
  }

  // Legacy fallback if device_id is a single string (not JSON)
  return teamDeviceId === payloadDeviceId;
}

