// ===============================
// src/scripts/webhook-setup.ts - Clean TypeScript ES Module
// ===============================
import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables from .env.local
config();

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: {
    url?: string;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
  };
}

const setupTelegramWebhook = async (): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.VERCEL_URL || process.env.RAILWAY_STATIC_URL;
  
  console.log('🔗 Setting up Telegram webhook...');
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
    console.log('');
    console.log('🔧 To fix this:');
    console.log('1. Create .env.local file in your project root');
    console.log('2. Add: TELEGRAM_BOT_TOKEN=your-bot-token-here');
    console.log('3. Get token from @BotFather on Telegram');
    console.log('');
    console.log('📝 Example .env.local content:');
    console.log('   TELEGRAM_BOT_TOKEN=1234567890:ABC-your-token-here');
    console.log('   WEBHOOK_URL=https://your-ngrok-url.ngrok.io');
    process.exit(1);
  }
  
  if (!webhookUrl) {
    console.error('❌ No webhook URL found!');
    console.log('');
    console.log('🔧 For local development, you need to expose your local server:');
    console.log('');
    console.log('   Using ngrok (recommended):');
    console.log('   1. Install: npm install -g ngrok');
    console.log('   2. Run: ngrok http 3000');
    console.log('   3. Copy the https URL (e.g., https://abc123.ngrok.io)');
    console.log('   4. Add to .env.local: WEBHOOK_URL=https://abc123.ngrok.io');
    console.log('   5. Run: npm run dev');
    console.log('');
    process.exit(1);
  }
  
  const webhookEndpoint = `${webhookUrl}/api/webhooks/telegram`;
  console.log(`📡 Setting webhook to: ${webhookEndpoint}`);
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Personal-Assistant/1.0'
      },
      body: JSON.stringify({ 
        url: webhookEndpoint,
        drop_pending_updates: true,
        allowed_updates: ['message']
      })
    });
    
    const result = await response.json() as TelegramResponse;
    
    if (result.ok) {
      console.log('✅ Telegram webhook configured successfully');
      console.log(`   URL: ${webhookEndpoint}`);
      
      // Verify the webhook
      await verifyWebhook(botToken, webhookEndpoint);
      
      console.log('');
      console.log('🧪 Test your bot:');
      console.log('   1. Find your bot on Telegram');
      console.log('   2. Send: "Hi"');
      console.log('   3. You should get an onboarding response');
      console.log('');
    } else {
      console.error('❌ Failed to set webhook:', result.description || 'Unknown error');
      console.log('');
      console.log('Common issues:');
      console.log('• Make sure your webhook URL is publicly accessible');
      console.log('• URL must use HTTPS (not HTTP)');
      console.log('• Bot token must be correct');
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error setting up webhook:', errorMessage);
    console.log('');
    console.log('This usually means:');
    console.log('• Network connectivity issues');
    console.log('• Invalid bot token');
    console.log('• Webhook URL is not reachable');
    process.exit(1);
  }
};

const verifyWebhook = async (botToken: string, expectedUrl: string): Promise<void> => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const info = await response.json() as TelegramResponse;
    
    if (info.ok && info.result) {
      if (info.result.url === expectedUrl) {
        console.log('✅ Webhook verification successful');
        console.log(`   Pending updates: ${info.result.pending_update_count || 0}`);
        
        if (info.result.last_error_date) {
          const errorDate = new Date(info.result.last_error_date * 1000);
          console.log(`⚠️  Last error: ${info.result.last_error_message || 'Unknown'} (${errorDate.toLocaleString()})`);
        }
      } else {
        console.warn('⚠️  Webhook verification failed - URL mismatch');
        console.log(`   Expected: ${expectedUrl}`);
        console.log(`   Actual: ${info.result.url || 'None'}`);
      }
    } else {
      console.warn('⚠️  Could not verify webhook');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('⚠️  Webhook verification failed:', errorMessage);
  }
};

const deleteWebhook = async (): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found');
    return;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
      method: 'POST'
    });
    
    const result = await response.json() as TelegramResponse;
    
    if (result.ok) {
      console.log('✅ Webhook deleted successfully');
    } else {
      console.error('❌ Failed to delete webhook:', result.description || 'Unknown error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error deleting webhook:', errorMessage);
  }
};

const checkWebhookStatus = async (): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found');
    return;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const info = await response.json() as TelegramResponse;
    
    if (info.ok && info.result) {
      console.log('📋 Current webhook status:');
      console.log(`   URL: ${info.result.url || 'None'}`);
      console.log(`   Pending updates: ${info.result.pending_update_count || 0}`);
      
      if (info.result.last_error_date) {
        const errorDate = new Date(info.result.last_error_date * 1000);
        console.log(`   Last error: ${info.result.last_error_message || 'Unknown'} (${errorDate.toLocaleString()})`);
      }
    } else {
      console.error('❌ Failed to get webhook info:', info.description || 'Unknown error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error getting webhook info:', errorMessage);
  }
};

// Handle command line arguments
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  
  if (args.includes('--delete')) {
    console.log('🗑️  Deleting webhook...');
    await deleteWebhook();
  } else if (args.includes('--verify') || args.includes('--status')) {
    console.log('🔍 Checking webhook status...');
    await checkWebhookStatus();
  } else {
    // Default: setup webhook
    await setupTelegramWebhook();
  }
};

// Run if this file is executed directly
const currentFile = new URL(import.meta.url).pathname;
const isMainFile = process.argv[1] && (
  process.argv[1].endsWith('webhook-setup.ts') || 
  process.argv[1].endsWith('webhook-setup.js') ||
  currentFile.endsWith(process.argv[1])
);

if (isMainFile) {
  main().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Script failed:', errorMessage);
    process.exit(1);
  });
}

// Export for use in other modules
export { setupTelegramWebhook, deleteWebhook, checkWebhookStatus };