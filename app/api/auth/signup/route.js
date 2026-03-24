import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { createUser, isStorageUnavailableError } from '@/lib/storage';
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

    if (name.length < 2 || password.length < 6) {
      return NextResponse.json(
        {
          error: 'Name must be at least 2 chars and password at least 6 chars.',
        },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(name, passwordHash);
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
  } catch (error) {
    if (error.message === 'USER_EXISTS') {
      return NextResponse.json(
        { error: 'User already exists.' },
        { status: 409 },
      );
    }

    if (isStorageUnavailableError(error)) {
      return NextResponse.json(
        {
          error:
            'Database unavailable. Configure MONGODB_URI and allow Vercel access in MongoDB Atlas.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to create user.' },
      { status: 500 },
    );
  }
}
