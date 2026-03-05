import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/chats/:chatId/messages — add a message to a chat
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await req.json();
  const { role, content, isStreamed } = body as {
    role: string;
    content: string;
    isStreamed?: boolean;
  };

  const message = await prisma.message.create({
    data: {
      chatId,
      role,
      content,
      isStreamed: isStreamed ?? false,
    },
  });

  return NextResponse.json(message, { status: 201 });
}

// PATCH /api/chats/:chatId/messages — update the last model message (for streaming)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await req.json();
  const { messageId, content, isStreamed } = body as {
    messageId: string;
    content: string;
    isStreamed?: boolean;
  };

  const message = await prisma.message.update({
    where: { id: messageId, chatId },
    data: {
      content,
      ...(isStreamed !== undefined && { isStreamed }),
    },
  });

  return NextResponse.json(message);
}
