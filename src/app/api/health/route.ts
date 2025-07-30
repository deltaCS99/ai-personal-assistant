// ===============================
// src/app/api/health/route.ts
// ===============================
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database/client';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const userCount = await prisma.user.count();
    const leadCount = await prisma.lead.count();
    const transactionCount = await prisma.transaction.count();
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        ai: process.env.AI_PROVIDER || 'openai'
      },
      stats: {
        users: userCount,
        leads: leadCount,
        transactions: transactionCount
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: 'Database connection failed' 
      },
      { status: 500 }
    );
  }
}
