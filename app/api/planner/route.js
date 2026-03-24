import { NextResponse } from 'next/server';
import { getPlannerData } from '@/lib/planner';

export async function GET() {
  try {
    const planner = getPlannerData();
    return NextResponse.json(planner);
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to load planner data.' },
      { status: 500 },
    );
  }
}
