// ===============================
// src/app/api/cron/notifications/route.ts - Vercel Cron API
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/services/notification.service';
import { prisma } from '@/lib/database/client';
import { log } from '@/lib/logger';

const notificationService = new NotificationService();

export async function GET(request: NextRequest) {
  try {
    // Verify this is from Vercel Cron (optional security)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Find users due for notifications
    const morningUsers = await prisma.user.findMany({
      where: {
        enableMorningNotification: true,
        morningNotificationTime: {
          startsWith: currentTime.substring(0, 4)
        }
      }
    });

    const eveningUsers = await prisma.user.findMany({
      where: {
        enableEveningNotification: true,
        eveningNotificationTime: {
          startsWith: currentTime.substring(0, 4)
        }
      }
    });

    // Send notifications
    for (const user of morningUsers) {
      await notificationService.sendMorningDigest(user.id);
    }

    for (const user of eveningUsers) {
      await notificationService.sendEveningSummary(user.id);
    }

    return NextResponse.json({ 
      success: true, 
      morningCount: morningUsers.length,
      eveningCount: eveningUsers.length 
    });

  } catch (error) {
    log.error('Cron notification failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}