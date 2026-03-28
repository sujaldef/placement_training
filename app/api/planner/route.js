import { NextResponse } from 'next/server';
import { getPlannerData } from '@/lib/planner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function cleanText(value) {
  return String(value || '').trim();
}

function parseStartDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseStartVideoPosition(value) {
  const text = cleanText(value);
  if (!text) return '';
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

function parseOptionalId(value) {
  const text = cleanText(value);
  if (!text || text.toLowerCase() === 'none') return '';
  return text;
}

function getMissingRequiredEnvVars() {
  const required = cleanText(process.env.REQUIRED_ENV_VARS)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (process.env.STRICT_ENV_VALIDATION === 'true') {
    required.push('MONGODB_URI');
  }

  return [...new Set(required)].filter((name) => !cleanText(process.env[name]));
}

function normalizePlannerResponse(planner) {
  const source = planner && typeof planner === 'object' ? planner : {};
  return {
    settings:
      source.settings && typeof source.settings === 'object'
        ? source.settings
        : {},
    weeks: Array.isArray(source.weeks) ? source.weeks : [],
    meta: source.meta && typeof source.meta === 'object' ? source.meta : {},
  };
}

export async function GET(request) {
  try {
    const missingEnvVars = getMissingRequiredEnvVars();
    if (missingEnvVars.length > 0) {
      const message = `Missing required environment variables: ${missingEnvVars.join(', ')}`;
      console.error('[planner][env]', { missingEnvVars });
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { searchParams } = request.nextUrl;
    const settings = {
      startDate: parseStartDate(searchParams.get('startDate')),
      startVideoPosition: parseStartVideoPosition(
        searchParams.get('startVideoPosition'),
      ),
      startDsaTopicId: parseOptionalId(searchParams.get('startDsaTopicId')),
      startAptitudeId: parseOptionalId(searchParams.get('startAptitudeId')),
    };

    const planner = getPlannerData(settings);
    if (!planner || typeof planner !== 'object') {
      throw new Error('Planner generator returned invalid payload.');
    }

    return NextResponse.json(normalizePlannerResponse(planner));
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to load planner data.';
    console.error('[planner][GET]', {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
