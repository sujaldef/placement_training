import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifyAuthToken } from '@/lib/auth';
import {
  getProgressByUser,
  isStorageUnavailableError,
  setProgressForUser,
} from '@/lib/storage';

const VALID_STATUSES = new Set(['todo', 'review', 'done']);

function getUserId(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    return null;
  }

  return String(payload.sub);
}

export async function GET(request) {
  const userId = getUserId(request);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const progress = await getProgressByUser(userId);
    return NextResponse.json(progress);
  } catch (error) {
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
      { error: 'Failed to load progress.' },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  const userId = getUserId(request);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const dayKey = String(body?.dayKey || '').trim();
    const status = String(body?.status || '').trim();

    if (!dayKey) {
      return NextResponse.json(
        { error: 'dayKey is required.' },
        { status: 400 },
      );
    }

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'status must be one of todo/review/done.' },
        { status: 400 },
      );
    }

    const result = await setProgressForUser(userId, dayKey, status);
    return NextResponse.json({
      ok: true,
      dayKey,
      status,
      storageMode: result.storageMode,
    });
  } catch (error) {
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
      { error: 'Failed to save progress.' },
      { status: 500 },
    );
  }
}
