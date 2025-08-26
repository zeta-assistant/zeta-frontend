// app/api/onboarding/sync/route.ts
import { NextResponse } from 'next/server';
import { syncOnboardingStatus } from '@/lib/onboarding';

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    const status = await syncOnboardingStatus(projectId);
    return NextResponse.json({ ok: true, status });
  } catch (e: any) {
    console.error('sync onboarding error', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}