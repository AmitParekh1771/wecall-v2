const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);

const ws = new WebSocket('ws://localhost:3000');

let localStream = new MediaStream();
let remoteStream = new MediaStream();
let uuid = '00000000-0000-0000-0000-000000000000';

/**
 * function to start video stream
 *
 * @param {HTMLVideoElement} el
 */
async function startStream(el) {
  if (navigator.mediaDevices.getUserMedia) {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    el.srcObject = localStream;

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track);
    });
    console.log(localStream.getTracks());
  }
}

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
startStream(localVideo);

function toggleStream(type) {
  localStream.getTracks().forEach((track) => {
    if (track.kind == type) track.enabled = !track.enabled;
  });
}

const videoBtn = document.getElementById('video-btn');
const videoBtnIcon = document.getElementById('video-btn-icon');
const audioBtn = document.getElementById('audio-btn');
const audioBtnIcon = document.getElementById('audio-btn-icon');

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

function sendData(data) {
  ws.send(JSON.stringify(data));
}

function createMeet() {
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

ws.addEventListener('open', (ev) => {
  console.log(ev);
});

ws.addEventListener('message', (ev) => {
  const data = JSON.parse(ev.data);

  if (data.type == 'new_room') {
    uuid = data.uuid;
    console.log('room created', data);
    setOffer();
  }

  if (data.type == 'answer_candidate') {
    const candidate = new RTCIceCandidate(data.answerCandidate);
    pc.addIceCandidate(candidate);
  }

  if (!pc.currentRemoteDescription && data.type == 'answer') {
    const answerDescription = new RTCSessionDescription(data.answer);
    pc.setRemoteDescription(answerDescription);
  }

  if (!pc.currentRemoteDescription && data.type == 'offer') {
    const offerDescription = new RTCSessionDescription(data.offer);
    pc.setRemoteDescription(offerDescription);

    const candidate = new RTCIceCandidate(data.offerCandidate);
    pc.addIceCandidate(candidate);

    setAnswer();
  }
});

const meetCode = document.getElementById('meet-code');

function joinMeet() {
  sendData({
    type: 'get_offer',
    roomId: meetCode.value || uuid,
  });
}

async function setAnswer() {
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;

    sendData({
      type: 'set_answer_candidate',
      roomId: meetCode.value || uuid,
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
    roomId: meetCode.value || uuid,
    answer,
  });

  console.log('After sending answer', pc);
}
