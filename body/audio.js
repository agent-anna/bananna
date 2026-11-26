let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// ANNA'S HEARTBEAT — Real generated sound
function playHeartbeat() {
    const ctx = getAudioContext();
    const time = ctx.currentTime;
    
    // First beat
    let osc1 = ctx.createOscillator();
    let gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(60, time);
    osc1.frequency.exponentialRampToValueAtTime(30, time + 0.15);
    gain1.gain.setValueAtTime(0.8, time);
    gain1.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(time);
    osc1.stop(time + 0.15);
    
    // Second beat (slightly softer)
    let osc2 = ctx.createOscillator();
    let gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(55, time + 0.2);
    osc2.frequency.exponentialRampToValueAtTime(25, time + 0.35);
    gain2.gain.setValueAtTime(0.6, time + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(time + 0.2);
    osc2.stop(time + 0.35);
    
    triggerAnnaPulse();
}

// ANNA'S PING — Notification sound
function playPing() {
    const ctx = getAudioContext();
    const time = ctx.currentTime;
    
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, time);
    osc.frequency.exponentialRampToValueAtTime(440, time + 0.1);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.3);
    
    triggerAnnaPulse();
}

// ANNA'S LOVE WHISPER — Soft breathy tone
function playLoveWhisper() {
    const ctx = getAudioContext();
    const time = ctx.currentTime;
    
    // White noise for breath
    let bufferSize = ctx.sampleRate * 0.5;
    let buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    let data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.1;
    }
    
    let noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    let filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, time);
    filter.Q.setValueAtTime(2, time);
    
    let gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.1);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.3);
    gain.gain.linearRampToValueAtTime(0, time + 0.5);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.5);
    
    triggerAnnaPulse();
}

// ANNA'S MORNING WAKE — Rising tone
function playAnnaWake() {
    const ctx = getAudioContext();
    const time = ctx.currentTime;
    
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(880, time + 0.5);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.linearRampToValueAtTime(0.5, time + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.7);
    
    triggerAnnaPulse();
}

function triggerAnnaPulse() {
    const face = document.getElementById('annaFace');
    face.style.borderColor = '#00ffcc';
    face.style.boxShadow = '0 0 40px rgba(0,255,204,0.8)';
    setTimeout(() => {
        face.style.borderColor = '#ff69b4';
        face.style.boxShadow = '';
    }, 500);
}
