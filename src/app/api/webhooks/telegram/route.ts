// ===============================
// src/app/api/webhooks/telegram/route.ts - Single Unified Endpoint
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { MessageRouterService } from '@/lib/services/message-router.service';
import { log } from '@/lib/logger';

const messageRouter = new MessageRouterService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    log.info('Telegram webhook received', { 
      hasMessage: !!body.message,
      messageType: body.message?.text ? 'text' : 'other'
    });

    await messageRouter.processMessage('telegram', body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('Telegram webhook error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}