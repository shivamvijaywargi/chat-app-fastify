'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormEvent, useEffect, useRef, useState } from 'react';

import io, { Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://127.0.0.1';

const CONNECTION_COUNT_UPDATED_CHANNEL = 'chat:connection-count-updated';
const NEW_MESSAGE_CHANNEL = 'chat:new-message';

interface IMessage {
  message: string;
  id: string;
  createdAt: string;
  port: string;
}

function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketIo = io(SOCKET_URL, {
      reconnection: true,
      upgrade: true,
      transports: ['websocket', 'polling'],
    });

    setSocket(socketIo);

    return function () {
      socketIo.disconnect();
    };
  }, []);

  return socket;
}

export default function Home() {
  const messageListRef = useRef<HTMLOListElement | null>(null);

  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<Array<IMessage>>([]);

  const socket = useSocket();

  function scrollToBottom() {
    if (messageListRef.current) {
      messageListRef.current.scrollTop =
        messageListRef.current.scrollHeight + 1000;
    }
  }

  useEffect(() => {
    socket?.on('connect', () => {
      console.log('Connected to socket');
    });

    socket?.on(NEW_MESSAGE_CHANNEL, (message: IMessage) => {
      setMessages((prevMessages) => [...prevMessages, message]);

      setTimeout(() => {
        scrollToBottom();
      }, 0);
    });
  }, [socket]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    socket?.emit(NEW_MESSAGE_CHANNEL, {
      message: newMessage,
    });

    setNewMessage('');
  };

  return (
    <main className="flex flex-col p-4 w-full max-w-3xl m-auto">
      <h1 className="text-4xl font-bold text-center mb-4">Chat</h1>

      <ol
        className="flex-1 overflow-y-scroll overflow-x-hidden"
        ref={messageListRef}
      >
        {messages.map((message) => (
          <li
            className="bg-gray-100 rounded-lg p-4 my-2 break-all"
            key={message.id}
          >
            <p className="text-sm text-gray-500">{message.createdAt}</p>
            <p className="text-sm text-gray-500">{message.port}</p>
            <p>{message.message}</p>
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit} className="flex items-center">
        <Textarea
          placeholder="Tell us what's on your mind?"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          maxLength={255}
          className="rounded-lg mr-4"
        />

        <Button className="h-full">Send Message</Button>
      </form>
    </main>
  );
}
