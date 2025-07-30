// ===============================
// src/scripts/run-notifications.ts - Standalone Notification Runner
// ===============================
import { NotificationSchedulerService } from '../lib/services/notification-scheduler.service';
import { log } from '../lib/logger';

// Handle graceful shutdown
process.on('SIGINT', () => {
  log.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

// Start notification scheduler
const scheduler = new NotificationSchedulerService();

log.info('Starting notification scheduler...');
scheduler.start();

log.info('Notification scheduler is running. Press Ctrl+C to stop.');

// Keep process alive
setInterval(() => {
  // Heartbeat every 5 minutes
  log.debug('Notification scheduler heartbeat');
}, 5 * 60 * 1000);