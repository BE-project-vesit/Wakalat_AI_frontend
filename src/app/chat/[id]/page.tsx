'use client';

import { useState, useEffect } from 'react';
import { useParams, notFound, useRouter } from 'next/navigation';
import { useChatStore } from '@/store/chatStore';
import ChatMessage from '@/components/ChatMessage';
import StreamingChatMessage from '@/components/StreamingChatMessage'; // --- NEW: Import streaming component
import { ArrowUp, Bot } from 'lucide-react';

export default function ChatPage() {
  const params = useParams();
  const id = params.id as string;
  
  // --- NEW: Get data and actions from our chat store ---
  const { chats, sendMessageWithGemini, setActiveChatId, markMessageAsStreamed } = useChatStore();
  const chat = chats.find(c => c.id === id);

  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setActiveChatId(id);
    return () => setActiveChatId(null); // Clear active chat when leaving page
  }, [id, setActiveChatId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      // Use Gemini with MCP integration
      await sendMessageWithGemini(id, newMessage.trim(), true);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (!chat) {
    // This will show notFound if the ID is invalid
    return notFound();
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      <main className="flex-1 overflow-y-auto pt-20 pb-32">
        <div className="max-w-4xl mx-auto py-6 px-4">
          <div className="text-center mb-10 pt-2">
            <h1 className="text-2xl font-bold text-stone-600 dark:text-stone-400 tracking-wide">{chat.title}</h1>
          </div>
          <div className="space-y-0">
            {chat.messages.map((message, index) => {
              const isLastMessage = index === chat.messages.length - 1;
              const isModel = message.role === 'Model';

              // --- NEW: Use the Streaming component for the last AI message that hasn't been streamed ---
              if (isModel && isLastMessage && !message.isStreamed) {
                return (
                  <div key={index} className="w-full px-4 md:px-6 lg:px-8 py-4 flex bg-stone-50 dark:bg-[#171717]">
                    <div className="w-full max-w-4xl mx-auto flex items-start gap-6">
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500/10 dark:bg-blue-500/10">
                            <Bot size={20} className="text-orange-500 dark:text-orange-400" />
                        </div>
                        <div className="flex-grow text-stone-800 dark:text-[#e3e3e3]">
                            <div className="mb-1 text-sm font-medium text-orange-600 dark:text-orange-400">WAKALAT.AI</div>
                            <StreamingChatMessage 
                              content={message.content} 
                              onStreamComplete={() => markMessageAsStreamed(id, index)}
                            />
                        </div>
                    </div>
                  </div>
                );
              }
              
              // Render regular messages normally
              return <ChatMessage key={index} role={message.role} content={message.content} />;
            })}
          </div>
        </div>
      </main>

      {/* --- NEW: Input form for follow-up messages --- */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm z-20">
        <div className="max-w-4xl mx-auto p-4">
            <form onSubmit={handleSendMessage} className="relative">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Ask a follow-up question..."
                    className="w-full bg-stone-100 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 rounded-lg text-stone-800 dark:text-white placeholder:text-stone-500 dark:placeholder:text-stone-400 p-4 pr-14 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                    type="submit"
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-amber-600 hover:bg-amber-700 rounded-full disabled:bg-stone-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed transition-colors"
                    disabled={!newMessage.trim() || isSending}
                >
                    <ArrowUp size={20} className="text-white" />
                </button>
            </form>
        </div>
      </footer>
    </div>
  );
}