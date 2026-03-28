import { NextResponse } from 'next/server';
import { getPlannerData } from '@/lib/planner';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const planner = getPlannerData({
      startDate: searchParams.get('startDate') || '',
      startVideoPosition: searchParams.get('startVideoPosition') || '',
      startDsaTopicId: searchParams.get('startDsaTopicId') || '',
      startAptitudeId: searchParams.get('startAptitudeId') || '',
    });

    return NextResponse.json(planner);
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to load planner data.' },
      { status: 500 },
    );
  }
}
