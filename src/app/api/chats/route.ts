import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/chats — list all chats (newest first) with their messages
export async function GET() {
  const chats = await prisma.chat.findMany({
    orderBy: { createdAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  return NextResponse.json(chats);
}

// POST /api/chats — create a new chat with an initial user message
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, title, userMessage } = body as {
    id: string;
    title: string;
    userMessage: string;
  };

  const chat = await prisma.chat.create({
    data: {
      id,
      title,
      messages: {
        create: { role: 'User', content: userMessage },
      },
    },
    include: { messages: true },
  });

  return NextResponse.json(chat, { status: 201 });
}
