import { useCallback, useEffect, useRef, useState } from "react";

const WS_BASE = "ws://localhost:8000/ws";

/**
 * Hook que gestiona el WebSocket de streaming de una auditoría.
 *
 * Protocolo de eventos recibidos del backend:
 *   { type: "connected" }
 *   { type: "start",  pid, tool, command }
 *   { type: "line",   pid, data }
 *   { type: "status", pid, data: "running"|"done"|"error", returncode }
 *
 * Expone:
 *   - output:      array de líneas { pid, data, ts }
 *   - statuses:    mapa pid -> { status, tool, command, returncode }
 *   - isConnected: el socket está abierto
 *   - wsReady:     se ha recibido el evento "connected" (seguro para POST /run)
 *   - connect(auditId) / disconnect() / clearOutput()
 */
export function useWebSocket() {
  const [output, setOutput] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [wsReady, setWsReady] = useState(false);

  const wsRef = useRef(null);
  const auditIdRef = useRef(null);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      // Evita que el onclose dispare lógica de reconexión.
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setWsReady(false);
  }, []);

  const connect = useCallback(
    (auditId) => {
      // Cierra cualquier conexión previa antes de abrir la nueva.
      disconnect();
      auditIdRef.current = auditId;

      const ws = new WebSocket(`${WS_BASE}/${auditId}`);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "connected":
            setWsReady(true);
            break;

          case "start":
            setStatuses((prev) => ({
              ...prev,
              [msg.pid]: {
                status: "running",
                tool: msg.tool,
                command: msg.command,
                returncode: null,
              },
            }));
            break;

          case "line":
            setOutput((prev) => [
              ...prev,
              { pid: msg.pid, data: msg.data, ts: Date.now() },
            ]);
            break;

          case "status":
            setStatuses((prev) => ({
              ...prev,
              [msg.pid]: {
                ...(prev[msg.pid] || {}),
                status: msg.data,
                returncode: msg.returncode ?? null,
              },
            }));
            break;

          default:
            break;
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setWsReady(false);
      };

      ws.onerror = () => {
        // onclose se encargará de actualizar el estado.
      };
    },
    [disconnect]
  );

  const clearOutput = useCallback(() => setOutput([]), []);

  // Cierra el socket al desmontar.
  useEffect(() => disconnect, [disconnect]);

  return {
    output,
    statuses,
    isConnected,
    wsReady,
    connect,
    disconnect,
    clearOutput,
  };
}
