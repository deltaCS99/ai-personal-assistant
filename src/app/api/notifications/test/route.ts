// ===============================
// src/app/api/notifications/test/route.ts - Test Notifications
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { NotificationSchedulerService } from '@/lib/services/notification-scheduler.service';
import { prisma } from '@/lib/database/client';
import { log } from '@/lib/logger';

const scheduler = new NotificationSchedulerService();

export async function POST(request: NextRequest) {
  try {
    const { userId, type } = await request.json();
    
    if (!userId || !type) {
      return NextResponse.json({ error: 'userId and type required' }, { status: 400 });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    log.info('Testing notification', { userId, type });

    if (type === 'morning') {
      await scheduler.triggerMorningDigest(userId);
    } else if (type === 'evening') {
      await scheduler.triggerEveningSummary(userId);
    } else {
      return NextResponse.json({ error: 'Invalid type. Use morning or evening' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${type} notification sent to user ${userId}` 
    });

  } catch (error) {
    log.error('Test notification failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get all users for testing
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        platform: true,
        services: true,
        enableMorningNotification: true,
        enableEveningNotification: true,
        morningNotificationTime: true,
        eveningNotificationTime: true
      }
    });

    return NextResponse.json({ users });
  } catch (error) {
    log.error('Get users failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
