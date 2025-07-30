// ===============================
// src/app/api/webhooks/whatsapp/route.ts
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { MessageRouterService } from '@/lib/services/message-router.service';
import { log } from '@/lib/logger';

const messageRouter = new MessageRouterService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    log.info('WhatsApp webhook received');
    
    await messageRouter.processMessage('whatsapp', body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('WhatsApp webhook error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// WhatsApp verification
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge);
  }
  
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}