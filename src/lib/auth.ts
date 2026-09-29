import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'aicssyc-treasure-hunt-secure-secret-key-2026-minimum-32-bytes'
);

export interface TeamJWTPayload {
  teamId: string;
  uid: string;
  teamName: string;
  deviceId?: string;
}

export async function signTeamToken(payload: TeamJWTPayload): Promise<string> {
  return await new SignJWT({ ...payload, role: 'team' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyTeamToken(token: string): Promise<TeamJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role !== 'team') return null;
    return {
      teamId: payload.teamId as string,
      uid: payload.uid as string,
      teamName: payload.teamName as string,
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
    .sign(JWT_SECRET);
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
