import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchMessages, sendMessage, subscribeToMessages, type BookingMessage } from '../services/bookingChat';

function formatMessageTime(createdAt: string): string {
  const d = new Date(createdAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface BookingChatProps {
  bookingId: string;
  currentUserType: 'customer' | 'detailer';
  otherPartyName?: string;
}

export default function BookingChat({ bookingId, currentUserType, otherPartyName }: BookingChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isOwnMessage = (msg: BookingMessage) =>
    (currentUserType === 'customer' && msg.sender_type === 'customer') ||
    (currentUserType === 'detailer' && msg.sender_type === 'detailer');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMessages(bookingId)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load messages');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  useEffect(() => {
    const unsub = subscribeToMessages(bookingId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return unsub;
  }, [bookingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    if (!user && currentUserType === 'customer') {
      setError('Sign in to send messages');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendMessage(bookingId, currentUserType, body);
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!user && currentUserType === 'customer') {
    return (
      <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
        <p className="text-sm font-medium text-gray-600 mb-2">Sign in to message your detailer</p>
        <p className="text-xs text-gray-500">Create an account or sign in to send messages.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">Loading messages...</div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {otherPartyName && (
        <p className="text-xs text-gray-500 mb-2 font-medium">Chat with {otherPartyName}</p>
      )}
      <div className="bg-gray-50/80 rounded-2xl border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-[10rem] overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-4">No messages yet. Say hi!</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${isOwnMessage(msg) ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex flex-col max-w-[85%] ${isOwnMessage(msg) ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm font-medium ${
                      isOwnMessage(msg)
                        ? 'bg-black text-white rounded-br-none'
                        : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'
                    }`}
                  >
                    {msg.body}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 px-1">
                    {formatMessageTime(msg.created_at)}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-gray-100 flex items-center gap-2 bg-white"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-grow px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium focus:outline-none focus:border-black"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
