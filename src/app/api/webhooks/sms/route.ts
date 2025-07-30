// ===============================
// src/app/api/webhooks/sms/route.ts - Single SMS Endpoint
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { MessageRouterService } from '@/lib/services/message-router.service';
import { log } from '@/lib/logger';

const messageRouter = new MessageRouterService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    log.info('SMS webhook received');
    
    await messageRouter.processMessage('sms', body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('SMS webhook error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
