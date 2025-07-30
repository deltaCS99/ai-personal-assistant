// ===============================
// src/lib/redis/client.ts - Railway Redis Client
// ===============================
import { createClient, RedisClientType } from 'redis';

class RedisManager {
  private static instance: RedisManager;
  private client: RedisClientType | null = null;
  private isConnecting = false;

  private constructor() {}

  static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  async getClient(): Promise<RedisClientType> {
    if (this.client && this.client.isOpen) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.client!;
    }

    this.isConnecting = true;

    try {
      this.client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries: number) => Math.min(retries * 50, 500),
          connectTimeout: 60000,
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('✅ Connected to Railway Redis');
      });

      await this.client.connect();
      this.isConnecting = false;
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }
}

export const redisManager = RedisManager.getInstance();