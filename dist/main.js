const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun4.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let pc = new RTCPeerConnection(servers);

const url = new URL(window.location);
const socketURL = `wss://${url.hostname}`;

const ws = new WebSocket(socketURL);

ws.addEventListener('open', (ev) => console.log("Socket connection open", ev));

ws.addEventListener('close', (ev) => console.log("Socket connection close", ev));

ws.addEventListener('error', (ev) => console.log("Socket connection error", ev));

let localStream = new MediaStream();
let remoteStream = new MediaStream();
let uuid = '00000000-0000-0000-0000-000000000000';

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

async function startStream() {
  if (navigator.mediaDevices.getUserMedia) {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track);
    });
  }
}

function toggleStream(type) {
  localStream.getTracks().forEach((track) => {
    if (track.kind == type) track.enabled = !track.enabled;
  });
}

const videoBtn = document.getElementById('video-btn');
const videoBtnIcon = document.getElementById('video-btn-icon');
const audioBtn = document.getElementById('audio-btn');
const audioBtnIcon = document.getElementById('audio-btn-icon');
const meetJoinSection = document.getElementById('meet-join-section');
const roomSection = document.getElementById('room-section');

const chatContainer = document.getElementById('chat-container');
const chatContainerBg = document.getElementById('chat-container-bg');
const chatInput = document.getElementById('chat-input');
const chatInputBtn = document.getElementById('chat-input-btn');
const chatBoxBtn = document.getElementById('chat-box-btn');
const chatMessages = document.getElementById('chat-messages');

chatContainer.style.display = 'none';
roomSection.style.display = 'none';

function changeRoute(route) {
  meetJoinSection.style.display = 'none';
  roomSection.style.display = 'none';

  switch(route) {
    case 'meet-join': 
      meetJoinSection.style.display = 'flex';
      break;
    case 'room':
      roomSection.style.display = 'flex';
      break;  
  }
}

videoBtn.addEventListener('click', () => {
  toggleStream('video');
  videoBtn.classList.toggle('feature-active');
  videoBtnIcon.innerText = videoBtnIcon.innerText == '' ? '' : '';
});

audioBtn.addEventListener('click', () => {
  toggleStream('audio');
  audioBtn.classList.toggle('feature-active');
  audioBtnIcon.innerText = audioBtnIcon.innerText == '' ? '' : '';
});

pc.addEventListener('track', (ev) => {
  remoteStream.addTrack(ev.track);
  remoteVideo.srcObject = remoteStream;
  console.log('remote track', ev.track);
});

pc.addEventListener('connectionstatechange', (ev) => {
  if(pc.connectionState == 'disconnected' || pc.connectionState == 'failed' || pc.connectionState == 'closed') hangUpCall();
  console.log('connection state change', pc.connectionState);
})

function sendData(data) {
  ws.send(JSON.stringify(data));
}

async function createMeet() {
  await startStream();

  sendData({
    type: 'create_room',
    roomId: uuid,
  });
}

async function setOffer() {
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;

    sendData({
      type: 'add_offer_candidate',
      roomId: uuid,
      offerCandidate: event.candidate.toJSON(),
    });
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  sendData({
    type: 'set_offer',
    roomId: uuid,
    offer,
  });

  console.log('After sending offer', pc);
}

const joiningCode = document.getElementById('joining-code');

ws.addEventListener('message', async (ev) => {
  const data = JSON.parse(ev.data);

  if (data.type == 'new_room_created') {
    joiningCode.innerText = uuid = data.uuid;

    console.log('new room created', data);

    changeRoute('room');

    setOffer();
  }
  
  if (!pc.currentRemoteDescription && data.type == 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    
    console.log('After getting answer', pc);
  }
  
  if(data.type == 'answer_candidate') {
    pc.addIceCandidate(new RTCIceCandidate(data.answerCandidate));
  }

  if (!pc.currentRemoteDescription && data.type == 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    data.offerCandidates.forEach(offerCandidate => {
      pc.addIceCandidate(new RTCIceCandidate(offerCandidate));
    });

    console.log('After getting offer', pc);

    changeRoute('room');

    setAnswer();
  }

  if(data.type == 'chat_message') {
    const textNode = document.createTextNode(data.message);
    const div = document.createElement('div');
    div.appendChild(textNode);
    data.isSender ? div.classList.add('sender-chat') : div.classList.add('receiver-chat');

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

});

/**
 * @type {HTMLInputElement}
 */
const meetCode = document.getElementById('meet-code');

async function joinMeet() {
  await startStream();

  uuid = meetCode.value.trim();
  
  sendData({
    type: 'get_offer',
    roomId: uuid,
  });
}

async function setAnswer() {
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;

    sendData({
      type: 'add_answer_candidate',
      roomId: uuid,
      answerCandidate: event.candidate.toJSON(),
    });
  };

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    sdp: answerDescription.sdp,
    type: answerDescription.type,
  };

  sendData({
    type: 'set_answer',
    roomId: uuid,
    answer,
  });

  console.log('After sending answer', pc);
}


function hangUpCall() {
  pc.close();
  localStream.getTracks().forEach(track => track.stop());
  location.reload();
}

setInterval(() => {
  sendData({
    type: 'ping'
  })
}, 50000);

function sendChatMessage() {
  sendData({
    type: 'send_chat_message',
    roomId: uuid,
    message: chatInput.value
  })
}

chatInputBtn.addEventListener('click', (ev) => {
  sendChatMessage();
  chatInput.value = '';
});

chatInput.addEventListener('keyup', (ev) => {
  if(ev.key != 'Enter') return; 
  
  sendChatMessage();
  chatInput.value = '';
});

chatBoxBtn.addEventListener('click', (ev) => {
  chatContainer.style.display = 'flex';
  chatBoxBtn.classList.add('feature-active');
});

chatContainerBg.addEventListener('click', (ev) => {
  chatContainer.style.display = 'none';
  chatBoxBtn.classList.remove('feature-active');
})
