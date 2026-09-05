import { WebSocketServer } from 'ws';

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Set();

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log('Client connected to WebSocket');
      
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('Client disconnected from WebSocket');
      });
    });
  }

  broadcast(event) {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  // Helper to connect engine events to websocket
  attachEngine(engine) {
    const events = [
      'workflow:start',
      'workflow:complete',
      'workflow:failed',
      'step:start',
      'step:complete',
      'step:error',
      'step:skipped',
      'step:log'
    ];

    events.forEach(eventName => {
      engine.on(eventName, (data) => {
        this.broadcast({ type: eventName, data });
      });
    });
  }
}

export default WebSocketManager;
