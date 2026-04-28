import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const eventIds = request.nextUrl.searchParams.get('ids')?.split(',') || [];
    
    if (eventIds.length === 0) {
      return NextResponse.json({ error: 'No event IDs provided' }, { status: 400 });
    }

    // Query latest backtest runs with diagnosticsJson (for queuedEventId)
    const runs = await prisma.backtestVersionRun.findMany({
      where: { modelBacktest: { modelType: 'PolyOiyenDailyQueue' } },
      include: { modelBacktest: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Extract event details from diagnosticsJson
    const eventDetailsMap = new Map();

    for (const run of runs) {
      try {
        const diagnostics = JSON.parse(String(run.diagnosticsJson || '{}'));
        const queuedEventId = diagnostics.queuedEventId;
        
        if (queuedEventId && eventIds.includes(String(queuedEventId))) {
          if (!eventDetailsMap.has(queuedEventId)) {
            eventDetailsMap.set(queuedEventId, {
              eventId: queuedEventId,
              totalReturn: run.avgReturn,
              winRate: run.aggregateWinRate,
              trades: diagnostics.queuedTradeCount ?? 0,
              status: run.backtestStatus === 'exited' ? 'Exited' : 'Active',
              modelName: run.modelBacktest?.name,
              runId: run.id,
              createdAt: run.createdAt,
            });
          }
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }

    // Build response maintaining order of requested eventIds
    const eventDetails = eventIds
      .map((id) => eventDetailsMap.get(id))
      .filter((e) => e !== undefined);

    await prisma.$disconnect();
    return NextResponse.json(eventDetails);
  } catch (error) {
    console.error('Error fetching event details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event details' },
      { status: 500 }
    );
  }
}
