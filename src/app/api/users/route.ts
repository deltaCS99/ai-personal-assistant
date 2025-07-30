// ===============================
// src/app/api/users/route.ts
// ===============================
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database/client';

export async function GET(request: NextRequest) {
  try {
    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: {
            leads: true,
            transactions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}