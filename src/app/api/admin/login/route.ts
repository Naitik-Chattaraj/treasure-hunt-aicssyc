import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { signAdminToken } from '@/lib/auth';

function getAdminPasswordHash(): string | null {
  // 1. If process.env already has a valid uncorrupted bcrypt hash (starts with $2)
  const envHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (envHash && envHash.startsWith('$2')) {
    return envHash;
  }

  // 2. Next.js @next/env strips '$2a', '$10', '$...' as shell variables in local dev unless escaped.
  // In development, safely read .env.local or .env to recover the true bcrypt hash.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const cwd = process.cwd();
      const candidateFiles = ['.env.local', '.env'];
      for (const fileName of candidateFiles) {
        const fullPath = path.join(/*turbopackIgnore: true*/ cwd, fileName);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const match = content.match(/ADMIN_PASSWORD_HASH\s*=\s*["']?\\?(\$2[abxy]?\\?\$[^\r\n"']+)["']?/);
          if (match && match[1]) {
            const clean = match[1].replace(/\\/g, '').trim();
            if (clean.startsWith('$2')) {
              return clean;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return envHash || null;
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // Only a bcrypt hash is accepted: no plain-text password and no built-in default,
    // since a default committed to the repo would be a public admin password.
    const hash = getAdminPasswordHash();
    if (!hash || !hash.startsWith('$2')) {
      console.error('Admin login disabled: ADMIN_PASSWORD_HASH is missing or not a bcrypt hash');
      return NextResponse.json({ error: 'Admin login is not configured' }, { status: 500 });
    }

    let isValid = false;
    try {
      isValid = bcrypt.compareSync(String(password), hash);
    } catch (err) {
      console.error('Bcrypt comparison error:', err);
    }

    if (!isValid) {
      return NextResponse.json({ error: 'INVALID ADMINISTRATIVE OVERRIDE KEY' }, { status: 401 });
    }

    const token = await signAdminToken();
    const response = NextResponse.json({ success: true, message: 'ADMIN ACCESS GRANTED' });

    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
