import { useEffect, useRef } from "react";

export function useRemote() {
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    socket.current = new WebSocket("ws://localhost:8000/ws/input/");

    socket.current.onopen = () => console.log("Conectado ao Django");
    socket.current.onerror = (e) => console.error("Erro no WS", e);

    return () => socket.current?.close();
  }, []);

  const sendCommand = (command: string, args: any[] = []) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ command, args }));
    }
  };

  const moveMouse = (dx: number, dy: number) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ dx, dy }));
    }
  };

  return { sendCommand, moveMouse };
}
