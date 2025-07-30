import { prisma } from '@/lib/database/client';
import { Platform } from '@/lib/types/user';
import { log } from '@/lib/logger';

interface User {
  id: string;
  platform: string;
  platformId: string;
  username?: string | null;
  name?: string | null;
  services: string;
  isSetupComplete: boolean;
  isActive: boolean;
  morningNotificationTime?: string | null;
  eveningNotificationTime?: string | null;
  enableMorningNotification: boolean;
  enableEveningNotification: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UserService {
  async findOrCreateUser(platform: Platform, platformId: string): Promise<User> {
    try {
      let user = await prisma.user.findUnique({
        where: {
          platform_platformId: {
            platform,
            platformId,
          },
        },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            platform,
            platformId,
            services: 'sales,finance', // Both services active by default
            isActive: true,
            isSetupComplete: false, // Start incomplete, fill as we go
          },
        });
        
        log.info('New user created', { 
          userId: user.id, 
          platform 
        });
      }

      return user;
    } catch (error) {
      log.error('User service error', error);
      throw error;
    }
  }

  async getSetupState(userId: string): Promise<{
    hasUsername: boolean;
    hasName: boolean;
    hasNotificationPrefs: boolean;
    isNewUser: boolean;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return {
          hasUsername: false,
          hasName: false,
          hasNotificationPrefs: false,
          isNewUser: true,
        };
      }

      return {
        hasUsername: !!user.username,
        hasName: !!user.name,
        hasNotificationPrefs: user.enableMorningNotification || user.enableEveningNotification,
        isNewUser: user.createdAt > new Date(Date.now() - 5 * 60 * 1000), // Created in last 5 minutes
      };
    } catch (error) {
      log.error('Get setup state error', error);
      return {
        hasUsername: false,
        hasName: false,
        hasNotificationPrefs: false,
        isNewUser: true,
      };
    }
  }

  async updateUsername(userId: string, username: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if username is taken
      const existing = await prisma.user.findUnique({
        where: { username },
      });

      if (existing && existing.id !== userId) {
        return { success: false, error: 'Username already taken' };
      }

      await prisma.user.update({
        where: { id: userId },
        data: { username },
      });

      return { success: true };
    } catch (error) {
      log.error('Update username error', error);
      return { success: false, error: 'Failed to update username' };
    }
  }

  async updateName(userId: string, name: string): Promise<boolean> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { name },
      });
      return true;
    } catch (error) {
      log.error('Update name error', error);
      return false;
    }
  }

  async updateNotificationPreferences(
    userId: string, 
    preferences: {
      morningTime?: string;
      eveningTime?: string;
      enableMorning?: boolean;
      enableEvening?: boolean;
    }
  ): Promise<boolean> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          morningNotificationTime: preferences.morningTime,
          eveningNotificationTime: preferences.eveningTime,
          enableMorningNotification: preferences.enableMorning || false,
          enableEveningNotification: preferences.enableEvening || false,
        },
      });
      return true;
    } catch (error) {
      log.error('Update notification preferences error', error);
      return false;
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { username },
      });
    } catch (error) {
      log.error('Get user by username error', error);
      return null;
    }
  }

  async getUserServices(userId: string): Promise<string[]> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.services) {
        return ['sales', 'finance']; // Default services
      }

      return user.services.split(',').filter((s: string) => s.length > 0);
    } catch (error) {
      log.error('Get user services error', error);
      return ['sales', 'finance'];
    }
  }
}