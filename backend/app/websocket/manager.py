import json
import asyncio
from typing import List, Optional
from fastapi import WebSocket, WebSocketDisconnect

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[RESCUE AI WS] New WebSocket client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[RESCUE AI WS] WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        
        # Serialize to JSON
        msg_text = json.dumps(message)
        dead_connections = []

        for connection in self.active_connections:
            try:
                await connection.send_text(msg_text)
            except Exception as e:
                print(f"[RESCUE AI WS ERROR] Broadcast error: {e}")
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead)

    def broadcast_sync(self, message: dict):
        """Dispatches broadcast safely from synchronous background threads into the asyncio event loop."""
        if not self.active_connections:
            return
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(message), self.loop)
        else:
            try:
                loop = asyncio.get_running_loop()
                if loop.is_running():
                    loop.create_task(self.broadcast(message))
            except RuntimeError:
                # No running loop in this thread; if self.loop was set, fallback
                if self.loop:
                    asyncio.run_coroutine_threadsafe(self.broadcast(message), self.loop)
                else:
                    print("[RESCUE AI WS WARNING] Cannot broadcast_sync: no active event loop available.")

ws_manager = ConnectionManager()
