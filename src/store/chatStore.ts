import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// --- 1. Define the types for our data ---
export interface Message {
  id?: string; // DB id (present after persistence)
  role: 'User' | 'Model';
  content: string;
  isStreamed?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  hydrated: boolean;
  loadChats: () => Promise<void>;
  createChat: (userInput: string, customTitle?: string) => string;
  addMessage: (chatId: string, message: Message) => void;
  setActiveChatId: (chatId: string | null) => void;
  markMessageAsStreamed: (chatId: string, messageIndex: number) => void;
  sendMessageWithGemini: (chatId: string, userMessage: string, useStreaming?: boolean) => Promise<void>;
  updateStreamingMessage: (chatId: string, messageIndex: number, content: string) => void;
}

// --- Helper: fire-and-forget DB calls (don't block the UI) ---
function persistChatToDB(id: string, title: string, userMessage: string) {
  fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, userMessage }),
  }).catch((err) => console.error('Failed to persist chat:', err));
}

function persistMessageToDB(chatId: string, role: string, content: string, isStreamed = false) {
  return fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content, isStreamed }),
  })
    .then((r) => r.json())
    .catch((err) => {
      console.error('Failed to persist message:', err);
      return null;
    });
}

function updateMessageInDB(chatId: string, messageId: string, content: string, isStreamed?: boolean) {
  fetch(`/api/chats/${chatId}/messages`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, content, isStreamed }),
  }).catch((err) => console.error('Failed to update message:', err));
}

// --- 2. Create the Zustand store ---
export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  hydrated: false,

  loadChats: async () => {
    try {
      const res = await fetch('/api/chats');
      if (!res.ok) throw new Error('Failed to load chats');
      const dbChats = await res.json();

      const chats: Chat[] = dbChats.map((c: any) => ({
        id: c.id,
        title: c.title,
        messages: c.messages.map((m: any) => ({
          id: m.id,
          role: m.role as 'User' | 'Model',
          content: m.content,
          isStreamed: m.isStreamed,
        })),
      }));

      set({ chats, hydrated: true });
    } catch (err) {
      console.error('Failed to load chats from DB:', err);
      set({ hydrated: true });
    }
  },

  setActiveChatId: (chatId) => set({ activeChatId: chatId }),

  createChat: (userInput, customTitle) => {
    const newChatId = uuidv4();
    const newChatTitle = customTitle || (userInput.split(' ').slice(0, 5).join(' ') + '...');

    const newChat: Chat = {
      id: newChatId,
      title: newChatTitle,
      messages: [{ role: 'User', content: userInput }],
    };

    set((state) => ({
      chats: [newChat, ...state.chats],
    }));

    // Persist to DB
    persistChatToDB(newChatId, newChatTitle, userInput);

    return newChatId;
  },

  addMessage: (chatId, message) => {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, message] }
          : chat
      ),
    }));
  },

  markMessageAsStreamed: (chatId, messageIndex) => {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((msg, idx) =>
                idx === messageIndex ? { ...msg, isStreamed: true } : msg
              ),
            }
          : chat
      ),
    }));
  },

  updateStreamingMessage: (chatId, messageIndex, content) => {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((msg, idx) =>
                idx === messageIndex ? { ...msg, content } : msg
              ),
            }
          : chat
      ),
    }));
  },

  sendMessageWithGemini: async (chatId, userMessage, useStreaming = true) => {
    // Add user message to local state
    get().addMessage(chatId, { role: 'User', content: userMessage });

    // Persist user message to DB
    persistMessageToDB(chatId, 'User', userMessage, true);

    // Get conversation history (exclude the user message we just added — it's the last one)
    const chat = get().chats.find((c) => c.id === chatId);
    const conversationHistory =
      chat?.messages
        .slice(0, -1)
        .map((msg) => ({
          role: msg.role === 'User' ? ('user' as const) : ('model' as const),
          content: msg.content,
        })) || [];

    // Add placeholder for model response, then read index from updated state
    get().addMessage(chatId, { role: 'Model', content: '', isStreamed: false });
    const updatedChat = get().chats.find((c) => c.id === chatId);
    const messageIndex = (updatedChat?.messages.length ?? 1) - 1;

    // Create a placeholder message in DB so we can update it later
    const dbMsg = await persistMessageToDB(chatId, 'Model', '', false);
    const dbMsgId: string | null = dbMsg?.id ?? null;

    try {
      if (useStreaming) {
        const response = await fetch('/api/gemini/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, conversationHistory, useMCPTools: true }),
        });

        if (!response.ok) throw new Error('Failed to get streaming response');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            accumulatedContent += chunk;
            get().updateStreamingMessage(chatId, messageIndex, accumulatedContent);
          }
        } else {
          accumulatedContent = await response.text();
          get().updateStreamingMessage(chatId, messageIndex, accumulatedContent);
        }

        get().markMessageAsStreamed(chatId, messageIndex);

        // Persist final content to DB
        if (dbMsgId) {
          updateMessageInDB(chatId, dbMsgId, accumulatedContent, true);
        }
      } else {
        const response = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, conversationHistory, useMCPTools: true }),
        });

        if (!response.ok) throw new Error('Failed to get response');

        const data = await response.json();
        if (data.success) {
          get().updateStreamingMessage(chatId, messageIndex, data.response);
          get().markMessageAsStreamed(chatId, messageIndex);

          if (dbMsgId) {
            updateMessageInDB(chatId, dbMsgId, data.response, true);
          }
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Error sending message with Gemini:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to get response from Gemini. Please check your API key configuration.';
      get().updateStreamingMessage(chatId, messageIndex, errorMessage);
      get().markMessageAsStreamed(chatId, messageIndex);

      if (dbMsgId) {
        updateMessageInDB(chatId, dbMsgId, errorMessage, true);
      }
    }
  },
}));
