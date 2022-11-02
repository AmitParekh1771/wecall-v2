// run `npm run start` in the terminal
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const WebSocketServer = require('ws').Server;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json());

const wss = new WebSocketServer({ server });

const rooms = [];

function sendData(data, connection) {
  connection.send(JSON.stringify(data));
}

function findRoom(roomId) {
  return rooms.find((room) => room.roomId == roomId);
}

wss.on('connection', (ws, req) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    const room = findRoom(data.roomId);

    switch (data.type) {
      case 'create_room':
        if (room) return;

        const newRoom = {
          connection: ws,
          roomId: uuidv4(),
        };
        rooms.push(newRoom);
        
        sendData({
          type: 'new_room',
          uuid: newRoom.roomId
        }, ws);
        break;

      case 'set_offer':
        if (!room) return;
        room.offer = data.offer;
        break;

      case 'get_offer':
        if (!room) return;

        sendData(
          {
            type: 'offer',
            offer: room.offer,
            offerCandidate: room.offerCandidate
          },
          ws
        );
        break;

      case 'set_offer_candidate':
        if (!room) return;
        room.offerCandidate = data.offerCandidate;
        break;

      case 'set_answer':
        if (!room) return;
        room.answer = data.answer;

        sendData(
          {
            type: 'answer',
            answer: data.answer,
          },
          room.connection
        );
        break;


      case 'set_answer_candidate':
        if (!room) return;
        room.answerCandidate = data.answerCandidate;
        
        sendData(
          {
            type: 'answer_candidate',
            answerCandidate: data.answerCandidate,
          },
          room.connection
        );
        break;
    }
  });

  ws.on('close', (reason, description) => {
    const index = rooms.findIndex((room) => room.connection == ws);

    rooms.splice(index, 1);
  });
});

app.get('/ping', (req, res) => {
  res.send({ message: 'pong' });
});

app.use((req, res) => {
  res.status(404).send({ message: 'not-found' });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Listening on port ${port}`));
