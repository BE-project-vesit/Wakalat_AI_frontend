'use client'; // This must be a client component to use hooks

import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// --- Import the necessary components for the global sidebar ---
import Sidebar from "@/components/Sidebar";
import { useSidebarStore } from "@/store/sidebarStore";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";
import { useAuthModalStore } from "@/store/authModalStore";
import { useChatStore } from "@/store/chatStore";
import MCPConnectionPanel from "@/components/MCPConnectionPanel";

const inter = Inter({ subsets: ["latin"] });

// Note: Metadata export is not supported in Client Components. 
// We will manage the title in the RootLayout component directly.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get state from stores
  const { isOpen, close } = useSidebarStore();
  const { isOpen: isAuthOpen, close: closeAuth } = useAuthModalStore();
  const loadChats = useChatStore((s) => s.loadChats);

  // Set the document title and load persisted chats
  useEffect(() => {
    document.title = "WAKALAT-AI";
    loadChats();
  }, [loadChats]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/white_logo.png" />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AuthModal isOpen={isAuthOpen} onClose={closeAuth} />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 2000,
                style: {
                  background: 'rgb(51 65 85)',
                  color: '#fff',
                },
                success: {
                  duration: 2000,
                  iconTheme: {
                    primary: '#10B981',
                    secondary: '#fff',
                  },
                },
              }}
            />
            <div className="flex flex-col min-h-screen bg-stone-50 dark:bg-zinc-900 text-stone-800 dark:text-stone-300 font-sans">
              <Header />

              {/* --- GLOBAL SIDEBAR LOGIC --- */}
              {/* This now lives in the root layout and will work on every page */}
              <AnimatePresence>
                {isOpen && (
                  <>
                    <Sidebar key="sidebar" />
                    <motion.div
                      key="overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={close} 
                      className="fixed inset-0 bg-black/50 z-40"
                      aria-hidden="true"
                    />
                  </>
                )}
              </AnimatePresence>
              
              {/* The page content (e.g., Home or ChatPage) is rendered here */}
              {children}
              
              <Footer />
              
              {/* MCP Connection Panel */}
              <MCPConnectionPanel />
            </div>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}