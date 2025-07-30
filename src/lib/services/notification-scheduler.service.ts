// ===============================
// src/lib/services/notification-scheduler.service.ts - Cron Job Manager
// ===============================
import * as cron from 'node-cron';
import { prisma } from '@/lib/database/client';
import { NotificationService } from './notification.service';
import { log } from '@/lib/logger';

export class NotificationSchedulerService {
  private readonly notificationService = new NotificationService();
  private isRunning = false;
  private scheduledTasks: cron.ScheduledTask[] = [];

  start(): void {
    if (this.isRunning) {
      log.warn('Notification scheduler already running');
      return;
    }

    log.info('Starting notification scheduler');

    // Run every 15 minutes to check for due notifications
    const task = cron.schedule('*/15 * * * *', async () => {
      await this.checkAndSendNotifications();
    }, {
    });

    this.scheduledTasks.push(task);
    task.start();

    this.isRunning = true;
    log.info('Notification scheduler started');
  }

  stop(): void {
    // Stop all scheduled tasks
    this.scheduledTasks.forEach(task => {
      task.stop();
      task.destroy();
    });
    
    this.scheduledTasks = [];
    this.isRunning = false;
    log.info('Notification scheduler stopped');
  }

  private async checkAndSendNotifications(): Promise<void> {
    try {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // Find users due for morning notifications
      const morningUsers = await prisma.user.findMany({
        where: {
          enableMorningNotification: true,
          morningNotificationTime: {
            startsWith: currentTime.substring(0, 4) // Match HH:MM (ignoring seconds)
          }
        }
      });

      // Find users due for evening notifications  
      const eveningUsers = await prisma.user.findMany({
        where: {
          enableEveningNotification: true,
          eveningNotificationTime: {
            startsWith: currentTime.substring(0, 4)
          }
        }
      });

      log.info('Checking notifications', { 
        currentTime,
        morningDue: morningUsers.length,
        eveningDue: eveningUsers.length
      });

      // Send morning notifications
      for (const user of morningUsers) {
        await this.notificationService.sendMorningDigest(user.id);
      }

      // Send evening notifications
      for (const user of eveningUsers) {
        await this.notificationService.sendEveningSummary(user.id);
      }

    } catch (error) {
      log.error('Notification check failed', error);
    }
  }

  // Manual trigger for testing
  async triggerMorningDigest(userId: string): Promise<void> {
    await this.notificationService.sendMorningDigest(userId);
  }

  async triggerEveningSummary(userId: string): Promise<void> {
    await this.notificationService.sendEveningSummary(userId);
  }
}
