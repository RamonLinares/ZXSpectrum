/**
 * Terra Cresta - Web Audio Chiptune Synthesizer
 * Plays Martin Galway's iconic music theme and authentic 1-bit sound effects.
 */

export class TerraAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.volume = 0.6;
    this.currentTrack = null;
    this.musicTimer = null;
    this.isPlayingMusic = false;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.muted && this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  // Play a simple frequency beep/envelope
  playTone(freq, duration, type = 'square', gainNode = null) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(gainNode || this.sfxGain);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio context catch
    }
  }

  // 1. Sound Effect: Player Laser Shot
  playLaser(tier = 1) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    const startFreq = 880 + tier * 120;
    const endFreq = 220;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // 2. Sound Effect: Explosion
  playExplosion(isBig = false) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const duration = isBig ? 0.6 : 0.25;

    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBig ? 450 : 800, now);
    filter.frequency.linearRampToValueAtTime(100, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isBig ? 0.6 : 0.35, now);
    gain.gain.linearRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  // 3. Sound Effect: Module Docking / Power Up
  playDockingJingle() {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.12, 'square');
      }, idx * 70);
    });
  }

  // 4. Sound Effect: Phoenix Fire Roar
  playPhoenixRoar() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.4);
    osc.frequency.linearRampToValueAtTime(440, now + 1.0);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 1.0);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.0);
  }

  // 5. Sound Effect: Formation Split / Recall
  playFormationSplit() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.3);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // 6. Martin Galway Iconic Terra Cresta Theme Synthesizer Loop
  startMusic() {
    if (this.isPlayingMusic) return;
    this.init();
    this.isPlayingMusic = true;

    // Melody notes (freq in Hz, duration in 16th steps)
    const melody = [
      { f: 293.66, d: 2 }, // D4
      { f: 329.63, d: 2 }, // E4
      { f: 349.23, d: 2 }, // F4
      { f: 440.00, d: 4 }, // A4
      { f: 392.00, d: 2 }, // G4
      { f: 349.23, d: 2 }, // F4
      { f: 329.63, d: 4 }, // E4

      { f: 261.63, d: 2 }, // C4
      { f: 293.66, d: 2 }, // D4
      { f: 329.63, d: 2 }, // E4
      { f: 392.00, d: 4 }, // G4
      { f: 349.23, d: 2 }, // F4
      { f: 329.63, d: 2 }, // E4
      { f: 293.66, d: 6 }, // D4

      { f: 440.00, d: 2 }, // A4
      { f: 493.88, d: 2 }, // B4
      { f: 523.25, d: 2 }, // C5
      { f: 587.33, d: 4 }, // D5
      { f: 523.25, d: 2 }, // C5
      { f: 493.88, d: 2 }, // B4
      { f: 440.00, d: 4 }, // A4

      { f: 392.00, d: 2 }, // G4
      { f: 440.00, d: 2 }, // A4
      { f: 349.23, d: 4 }, // F4
      { f: 329.63, d: 4 }, // E4
      { f: 293.66, d: 8 }, // D4
    ];

    let noteIdx = 0;
    const stepDuration = 0.12; // seconds per 16th note

    const playNextNote = () => {
      if (!this.isPlayingMusic || !this.ctx) return;
      const note = melody[noteIdx];
      const dur = note.d * stepDuration;

      this.playTone(note.f, dur * 0.9, 'square', this.musicGain);

      // Add 1-bit chiptune bass arpeggio
      const bassFreq = (noteIdx % 2 === 0) ? note.f / 2 : note.f / 4;
      this.playTone(bassFreq, dur * 0.4, 'triangle', this.musicGain);

      noteIdx = (noteIdx + 1) % melody.length;
      this.musicTimer = setTimeout(playNextNote, dur * 1000);
    };

    playNextNote();
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
