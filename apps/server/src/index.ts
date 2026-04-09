import http from 'node:http';

import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { GameRoom } from './rooms/GameRoom.js';

const port = Number(process.env.PORT ?? 2567);
const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('booger colyseus server');
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer })
});

gameServer.define('game', GameRoom);

httpServer.listen(port, () => {
  console.log(`Colyseus server running on http://localhost:${port}`);
});
