// run `npm run start` in the terminal
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const WebSocketServer = require('ws').Server;
const wss = new WebSocketServer({ server });
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config();

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => {
    console.log('Database connected');
    run();
  })
  .catch((reson) => {
    console.log(reson);
    throw new Error('Database connection error');
  });

const Room = mongoose.model('Room', new mongoose.Schema({
  offer: Object,
  answer: Object,
  offerCandidate: Object,
  answerCandidate: Object
}));

function sendData(data, connection) {
  connection.send(JSON.stringify(data));
}

async function createRoom(ws) {
  const doc = new Room();

  await doc.save();

  ws.hostedRoomId = doc._id.toString();

  sendData({
    type: 'new_room_created',
    uuid: doc._id
  }, ws);
}

async function setOffer(roomId, offer, ws) {
  const newDoc = await Room.findByIdAndUpdate(roomId, {
    $set: { offer }
  }, { new: true });

  if(!newDoc) return sendData({ type: 'room_not_found' }, ws);
}

async function setOfferCandidate(roomId, offerCandidate, ws) {
  const newDoc = await Room.findByIdAndUpdate(roomId, {
    $set: { offerCandidate }
  }, { new: true });
  
  if(!newDoc) return sendData({ type: 'room_not_found' }, ws);
}

async function getOffer(roomId, ws) {
  const doc = await Room.findById(roomId);
  
  if(!doc) return sendData({ type: 'room_not_found' }, ws);

  sendData({
    type: 'offer',
    offer: doc.offer,
    offerCandidate: doc.offerCandidate
  }, ws);
}

async function setAnswer(roomId, answer, ws) {
  const newDoc = await Room.findByIdAndUpdate(roomId, {
    $set: { answer }
  }, { new: true });

  if(!newDoc) return sendData({ type: 'room_not_found' }, ws);

  let hostWs;
  wss.clients.forEach(ws => {
    if(ws.hostedRoomId && ws.hostedRoomId == newDoc._id.toString()) hostWs = ws;
  });

  if(!hostWs) return;


  sendData({
    type: 'answer',
    answer: newDoc.answer
  }, hostWs);
}

async function setAnswerCandidate(roomId, answerCandidate, ws) {
  const newDoc = await Room.findByIdAndUpdate(roomId, {
    $set: { answerCandidate }
  }, { new: true });

  if(!newDoc) return sendData({ type: 'room_not_found' }, ws);

  let hostWs;
  wss.clients.forEach(ws => {
    if(ws.hostedRoomId && ws.hostedRoomId == newDoc._id) hostWs = ws;
  });

  if(!hostWs) return;

  sendData({
    type: 'answer_candidate',
    answerCandidate: newDoc.answerCandidate
  }, hostWs);
}

async function leaveRoom(ws) {
  const doc = await Room.findByIdAndDelete(ws.hostedRoomId);

  if(!doc) return;

  sendData({ type: 'room_removed' }, ws);
}

function run() {  
  app.use(express.static(path.join(__dirname, 'dist')));
  app.use(express.json());

  wss.on('connection', (ws, req) => {
    ws.on('message', (message) => {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'create_room':
          createRoom(ws);
          break;
  
        case 'set_offer':
          setOffer(data.roomId, data.offer, ws);
          break;
  
        case 'get_offer':
          getOffer(data.roomId, ws);
          break;
  
        case 'set_offer_candidate':
          setOfferCandidate(data.roomId, data.offerCandidate, ws);
          break;
  
        case 'set_answer':
          setAnswer(data.roomId, data.answer, ws);
          break;
  
        case 'set_answer_candidate':
          setAnswerCandidate(data.roomId, data.answerCandidate, ws);
          break;
      }
    });
  
    ws.on('close', (reason, description) => {
      leaveRoom(ws);
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
}
