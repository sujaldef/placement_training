import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { findUserByName } from '@/lib/storage';
import { getAuthCookieHeader, signAuthToken } from '@/lib/auth';

function parseBody(body) {
  return {
    name: String(body?.name || '').trim(),
    password: String(body?.password || ''),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, password } = parseBody(body);

    if (!name || !password) {
      return NextResponse.json(
        { error: 'Name and password are required.' },
        { status: 400 },
      );
    }

    const user = await findUserByName(name);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 },
      );
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 },
      );
    }

    const token = signAuthToken({ sub: user.id, name: user.name });

    return NextResponse.json(
      {
        ok: true,
        user: { id: user.id, name: user.name },
        storageMode: user.storageMode,
      },
      {
        headers: {
          'Set-Cookie': getAuthCookieHeader(token),
        },
      },
    );
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to login.' }, { status: 500 });
  }
}
