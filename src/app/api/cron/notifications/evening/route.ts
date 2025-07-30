// ===============================
// 3. src/app/api/cron/notifications/evening/route.ts
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/services/notification.service';
import { prisma } from '@/lib/database/client';
import { log } from '@/lib/logger';

const notificationService = new NotificationService();

export async function GET(request: NextRequest) {
  try {
    // Verify this is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    log.info('Starting evening notification cron job');

    // Find users who want evening notifications
    const users = await prisma.user.findMany({
      where: {
        enableEveningNotification: true,
        // Optional: Add timezone filtering if needed
        // timezone: 'Africa/Johannesburg'
      }
    });

    let successCount = 0;
    let errorCount = 0;

    // Send evening notifications
    for (const user of users) {
      try {
        await notificationService.sendEveningSummary(user.id);
        successCount++;
        log.info(`Evening summary sent to user ${user.id}`);
      } catch (error) {
        errorCount++;
        log.error(`Failed to send evening summary to user ${user.id}`, { error, userId: user.id });
      }
    }

    log.info('Evening notification cron completed', { 
      totalUsers: users.length, 
      successCount, 
      errorCount 
    });

    return NextResponse.json({ 
      success: true,
      type: 'evening',
      totalUsers: users.length,
      successCount,
      errorCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error('Evening cron notification failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
