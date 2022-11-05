const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);

const localSocket = 'ws://localhost:3000';
const herokuSocket = 'wss://wecall-v1.herokuapp.com';

const ws = new WebSocket(herokuSocket);

ws.addEventListener('open', (ev) => console.log("Socket connection open", ev));

ws.addEventListener('close', (ev) => console.log("Socket connection close", ev));

ws.addEventListener('error', (ev) => console.log("Socket connection error", ev));

let localStream = new MediaStream();
let remoteStream = new MediaStream();
let uuid = '00000000-0000-0000-0000-000000000000';
let isHost = false;

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
    console.log(localStream.getTracks());
  }
}

function stopStream() {
  localStream.getTracks().forEach(track => track.stop());
  // changeRoute('meet-join');
  location.reload();
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
  console.log(ev);
});

pc.addEventListener('signalingstatechange', (ev) => {
  pc.signalingState == 'closed' ? stopStream(): null;
});

function sendData(data) {
  ws.send(JSON.stringify(data));
}

async function createMeet() {
  pc.signalingState = 'stable';

  await startStream();

  isHost = true;

  sendData({
    type: 'create_room',
    roomId: uuid,
  });
}

async function setOffer() {
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;

    sendData({
      type: 'set_offer_candidate',
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

  console.log('After creating offer', pc);
}

const joiningCode = document.getElementById('joining-code');

ws.addEventListener('message', async (ev) => {
  const data = JSON.parse(ev.data);

  if (data.type == 'new_room_created') {
    joiningCode.innerText = uuid = data.uuid;

    changeRoute('room');

    console.log('room created', data);
    setOffer();
  }

  if (data.type == 'answer_candidate') {
    const candidate = new RTCIceCandidate(data.answerCandidate);
    await pc.addIceCandidate(candidate);
    
    console.log('After getting answer candidate', pc);
  }

  if (!pc.currentRemoteDescription && data.type == 'answer') {
    const answerDescription = new RTCSessionDescription(data.answer);
    await pc.setRemoteDescription(answerDescription);

    console.log('After getting answer description', pc);
  }

  if (!pc.currentRemoteDescription && data.type == 'offer') {
    const offerDescription = new RTCSessionDescription(data.offer);
    await pc.setRemoteDescription(offerDescription);

    const candidate = new RTCIceCandidate(data.offerCandidate);
    await pc.addIceCandidate(candidate);
    
    console.log('After getting offer description and candidate', pc);

    changeRoute('room');

    setAnswer();
  }
});

/**
 * @type {HTMLInputElement}
 */
const meetCode = document.getElementById('meet-code');

async function joinMeet() {
  await startStream();
  
  isHost = false;

  sendData({
    type: 'get_offer',
    roomId: meetCode.value.trim() || uuid,
  });
}

async function setAnswer() {
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;

    sendData({
      type: 'set_answer_candidate',
      roomId: meetCode.value.trim() || uuid,
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
    roomId: meetCode.value.trim() || uuid,
    answer,
  });

  console.log('After sending answer', pc);
}


function hangUpCall() {
  if(isHost) pc.close();
  stopStream();
  isHost = false;
}

setInterval(() => {
  sendData({
    type: 'ping'
  })
}, 50000);
