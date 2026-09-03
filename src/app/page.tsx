"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { PasscodeGate } from "@/components/passcode-gate";
import { AudioPlayer } from "@/components/audio-player";
import { MobileNav, SidebarOverlay } from "@/components/mobile-nav";
import { ProgressBar } from "@/components/progress-bar";
import { BlurText } from "@/components/blur-text";
import { AnimatedBG } from "@/components/animated-bg";
import { isPasscodeStored, getPasscodeHeaders, clearPasscode } from "@/lib/passcode";
import Link from "next/link";

type Message = {
  id: number;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
};

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
  _count?: { messages: number };
};

const HomePage: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [request, setRequest] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState<Record<number, number>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Check for stored passcode on mount (client-only to avoid hydration mismatch)
  useEffect(() => {
    setMounted(true);
    if (isPasscodeStored()) {
      setAuthenticated(true);
    }
  }, []);

  // Fetch conversations once authenticated
  useEffect(() => {
    if (authenticated) {
      fetchConversations();
    }
  }, [authenticated]);

  // Fetch messages when a conversation is selected
  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat);
    } else {
      setMessages([]);
    }
  }, [selectedChat]);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/speech", {
        headers: getPasscodeHeaders(),
      });
      if (!response.ok) {
        if (response.status === 401) {
          clearPasscode();
          setAuthenticated(false);
          return;
        }
        throw new Error("Failed to fetch conversations");
      }
      const { conversations } = await response.json();
      setConversations(conversations);
      // Fetch flashcard counts for each conversation
      conversations.forEach((conv: { id: number }) => fetchSessionFlashcards(conv.id));
      if (conversations.length > 0 && !selectedChat) {
        setSelectedChat(conversations[0].id);
      }
    } catch (error) {
      toast.error("Failed to load conversations");
      console.error(error);
    } finally {
      setInitialLoading(false);
    }
  }, [selectedChat]);

  async function fetchSessionFlashcards(convId: number) {
    try {
      const res = await fetch("/api/v1/session-flashcards?conversationId=" + convId, {
        headers: getPasscodeHeaders(),
      });
      if (res.ok) {
        const { items } = await res.json();
        setFlashcardCount((prev) => ({ ...prev, [convId]: items.length }));
      }
    } catch {}
  }

  async function fetchMessages(convId: number) {
    setMessagesLoading(true);
    try {
      const res = await fetch("/api/v1/speech?conversationId=" + convId, {
        headers: getPasscodeHeaders(),
      });
      if (res.ok) {
        const { messages: msgs } = await res.json();
        setMessages(msgs);
      }
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  }

  async function handleNewChat() {
    try {
      const response = await fetch("/api/v1/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPasscodeHeaders(),
        },
        body: JSON.stringify({
          prompt: "Hello! I want to learn German.",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create new chat");
      }

      const { message, conversation } = await response.json();
      if (conversation) {
        const newConversation: Conversation = {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
        };
        setConversations((prev) => [newConversation, ...prev]);
        setSelectedChat(conversation.id);
        // Set initial messages for the new conversation
        setMessages([
          {
            id: Date.now(),
            content: "Hello! I want to learn German.",
            role: "user",
            createdAt: new Date().toISOString(),
          },
          {
            id: Date.now() + 1,
            content: message,
            role: "assistant",
            createdAt: new Date().toISOString(),
          },
        ]);
        setSidebarOpen(false);
      }
    } catch (error) {
      console.error("Create chat error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create new chat",
      );
    }
  }

  async function handleSubmit(e?: React.MouseEvent) {
    if (e) e.preventDefault();
    const prompt = request.trim();
    if (!prompt || !selectedChat || loading) return;
    setLoading(true);
    setRequest("");

    // Add user message immediately
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder for streaming AI response
    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() }]);

    try {
      const response = await fetch("/api/v1/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPasscodeHeaders(),
        },
        body: JSON.stringify({
          prompt,
          conversationId: selectedChat,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // Split on newlines AND on }{ boundary (multiple JSON objects in one chunk)
        const rawLines = buffer.split("\n");
        buffer = rawLines.pop() || "";
        const lines: string[] = [];
        for (const rl of rawLines) {
          // Handle concatenated JSON: split }{ into separate objects
          const parts = rl.split(/\}\s*\{/);
          if (parts.length === 1) {
            lines.push(rl);
          } else {
            parts.forEach((p, i) => {
              if (i === 0) lines.push(p + "}");
              else if (i === parts.length - 1) lines.push("{" + p);
              else lines.push("{" + p + "}");
            });
          }
        }
        // Also handle leftover buffer with concatenated JSON
        if (buffer.includes("}{")) {
          const parts = buffer.split(/\}\s*\{/);
          buffer = "";
          parts.forEach((p, i) => {
            const line = i === 0 ? p + "}" : i === parts.length - 1 ? "{" + p : "{" + p + "}";
            try {
              const event = JSON.parse(line);
              handleStreamEvent(event);
            } catch {}
          });
        }

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleStreamEvent(event);
          } catch (parseErr) {
            // Skip malformed lines
          }
        }
      }
      function handleStreamEvent(event: any) {
        if (event.type === "header" && event.conversation) {
          const newConv: Conversation = {
            id: event.conversationId,
            title: event.conversation.title,
            createdAt: event.conversation.createdAt,
          };
          setConversations((prev) => [newConv, ...prev]);
          setSelectedChat(event.conversationId);
        } else if (event.type === "token") {
          streamContent += event.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: streamContent } : m
            )
          );
        } else if (event.type === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: event.message } : m
            )
          );
        } else if (event.type === "error") {
          throw new Error(event.error);
        }
      }
      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          handleStreamEvent(event);
        } catch (parseErr) {
          // Skip malformed remaining content
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to send message");
      // Remove empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteChat(chatId: number) {
    const confirmed = window.confirm("Delete this conversation?");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/v1/speech?conversationId=${chatId}`, {
        method: "DELETE",
        headers: getPasscodeHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");

      setConversations((prev) => prev.filter((c) => c.id !== chatId));
      if (selectedChat === chatId) {
        setSelectedChat(null);
      }
    } catch {
      toast.error("Failed to delete conversation");
    }
  }

  const currentConversation = conversations.find((c) => c.id === selectedChat);
  const flashcardCountVal = selectedChat ? flashcardCount[selectedChat] : undefined;

  // ── Don't render until mounted (avoids hydration mismatch) ──────────
  if (!mounted) {
    return (
      <main className="flex h-dvh items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
      </main>
    );
  }

  // ── Passcode gate ──────────────────────────────────────────────────
  if (!authenticated) {
    return <PasscodeGate onVerified={() => setAuthenticated(true)} />;
  }

  // ── Main layout ────────────────────────────────────────────────────
  return (
    <main className="flex h-dvh bg-zinc-50">
      {/* Mobile hamburger */}
      <MobileNav open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Sidebar — responsive */}
      <SidebarOverlay open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="border-b border-orange-100/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-semibold">
                <span className="text-orange-600">Sprache</span>{" "}
                <span className="text-zinc-900">AI</span>
              </h1>
              <Link
                href="/review"
                className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
              >
                📚 Review
              </Link>
            </div>
            <ProgressBar />
            <button
              onClick={handleNewChat}
              disabled={loading}
              className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
                  <span>Creating...</span>
                </div>
              ) : (
                "+ New Chat"
              )}
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-2">
            {initialLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
              </div>
            ) : (
              conversations.map((chat) => (
                <div
                  key={chat.id}
                  className="group relative mb-1 flex items-center"
                >
                  <button
                    onClick={() => {
                      setSelectedChat(chat.id);
                      setSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-xl px-4 py-3 text-left text-sm text-zinc-700 transition-all hover:bg-orange-50/60",
                      selectedChat === chat.id &&
                        "bg-orange-50 text-orange-700 shadow-apple-sm border border-orange-100/50",
                    )}
                  >
                    <div className="truncate">{chat.title}</div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <span>{new Date(chat.createdAt).toLocaleDateString()}</span>
                      {chat.id in flashcardCount ? <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">{flashcardCount[chat.id]} cards</span> : null}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChat(chat.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 opacity-0 transition-opacity hover:bg-red-100 group-hover:opacity-100"
                    aria-label="Delete conversation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 text-orange-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Sidebar footer */}
          <div className="border-t border-zinc-100 p-3">
            <button
              onClick={() => {
                clearPasscode();
                window.location.reload();
              }}
              className="w-full rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              Lock App
            </button>
          </div>
        </div>
      </SidebarOverlay>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col bg-white">
        {/* Header */}
        <header className="glass sticky top-0 z-20 flex h-14 items-center justify-between border-b border-orange-100/50 pl-16 pr-4 md:pl-6">
          <h1 className="text-lg font-semibold md:hidden">
            <span className="text-orange-600">Sprache</span>{" "}
            <span className="text-zinc-900">AI</span>
          </h1>
          <div className="hidden md:block" />
          <div className="flex items-center space-x-2">
            <ProgressBar />
            <Link href="/exam-prep" className="flex items-center space-x-1 rounded-lg px-3 py-1.5 text-sm text-orange-600 transition-colors hover:bg-orange-50">
              B2 Prep
            </Link>
            <Link href="/review" className="flex items-center space-x-1 rounded-lg px-3 py-1.5 text-sm text-amber-600 transition-colors hover:bg-amber-50">
              Review
            </Link>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-orange-50/30 to-white p-4">
          {initialLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
            </div>
          ) : !currentConversation ? (
            <div className="relative flex h-full flex-col items-center justify-center text-center">
              <AnimatedBG />
              <div className="relative z-10">
                <div className="mb-6 text-6xl" style={{ animation: "float-1 6s ease-in-out infinite" }}>🇩🇪</div>
                <BlurText
                  text="Willkommen bei Sprache AI"
                  className="text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl"
                  delay={200}
                />
                <p className="mt-4 max-w-md text-base leading-relaxed text-zinc-500" style={{ animationDelay: "0.6s" }}>
                  Your personal German tutor. Start chatting to learn vocabulary,
                  practice conversations, and work toward B2 fluency.
                </p>
                <div className="mt-8 flex items-center justify-center gap-3">
                  <Link
                    href="/exam-prep"
                    className="rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-medium text-orange-700 shadow-apple-sm transition-all hover:shadow-apple-md hover:border-orange-300"
                  >
                    B2 Prep
                  </Link>
                  <Link
                    href="/review"
                    className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-medium text-white shadow-apple-sm transition-all hover:bg-orange-700 hover:shadow-apple-md"
                  >
                    Start Review
                  </Link>
                </div>
              </div>
            </div>
          ) : messagesLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
            </div>
          ) : (
            <div className="space-y-4">               {messages.map((message, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start space-x-3",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] p-4 md:max-w-[80%]",
                      message.role === "user"
                        ? "rounded-2xl rounded-br-md bg-orange-600 text-white shadow-apple-sm"
                        : "rounded-2xl rounded-bl-md border border-orange-100/60 bg-white text-zinc-800 shadow-apple-md",
                    )}
                  >
                    <ReactMarkdown
                      className={cn(
                        "prose max-w-none text-sm",
                        message.role === "user" && "prose-invert",
                      )}
                    >
                      {message.content}
                    </ReactMarkdown>

                    {/* Audio player for AI messages */}
                    {message.role === "assistant" && (
                      <div className="mt-2 border-t border-amber-100 pt-2">
                        <AudioPlayer text={message.content} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-orange-100/60 bg-white px-5 py-3.5 shadow-apple-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" style={{ animationDelay: "0ms" }} />
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" style={{ animationDelay: "200ms" }} />
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" style={{ animationDelay: "400ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="border-t border-orange-100/50 bg-white/80 p-3 safe-bottom backdrop-blur-sm md:p-4">
          <div className="flex space-x-2">
            <Textarea
              onKeyDownCapture={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={
                initialLoading
                  ? "Loading..."
                  : selectedChat
                    ? "Type your message..."
                    : "Create a chat to start"
              }
              disabled={loading || initialLoading || !selectedChat}
              className="min-h-[44px] w-full resize-none rounded-xl border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-500 transition-colors focus:border-orange-500 focus:ring-orange-500 disabled:opacity-50"
              rows={1}
            />
            <button
              onClick={handleSubmit}
              disabled={
                loading || initialLoading || !selectedChat || !request.trim()
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-apple-sm transition-all hover:bg-orange-700 hover:shadow-apple-md active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default HomePage;
