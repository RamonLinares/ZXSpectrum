/**
 * ZX Spectrum 48K Web Audio Beeper Engine
 * Accurate 1-bit audio synthesis with low-pass filtering and volume control.
 */

export class SpectrumAudio {
  constructor() {
    this.ctx = null;
    this.gainNode = null;
    this.filterNode = null;
    this.enabled = true;
    this.volume = 0.5;
    this.sampleRate = 44100;
    this.bufferSize = 2048;
    this.beeperState = 0;
    this.earState = 0;

    // Buffer queue for smooth continuous streaming
    this.sampleBuffer = new Float32Array(44100 * 2);
    this.writePos = 0;
    this.readPos = 0;
    this.audioScheduledTime = 0;

    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx({ sampleRate: 44100 });
      this.sampleRate = this.ctx.sampleRate;

      // Master gain
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      // Low-pass filter to smooth square wave / remove harsh anti-aliasing artifacts
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(6000, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.0, this.ctx.currentTime);

      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.audioScheduledTime = this.ctx.currentTime;
      this.initialized = true;
    } catch (e) {
      console.warn('AudioContext initialization error:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.01);
    }
  }

  setMuted(muted) {
    this.enabled = !muted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Queue audio frame samples synthesized from the frame's T-states
   * @param {Float32Array} frameSamples - normalized samples (-1.0 to 1.0)
   */
  queueAudioFrame(frameSamples) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    const numSamples = frameSamples.length;
    if (numSamples === 0) return;

    const audioBuf = this.ctx.createBuffer(1, numSamples, this.sampleRate);
    const channelData = audioBuf.getChannelData(0);
    channelData.set(frameSamples);

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(this.filterNode);

    const now = this.ctx.currentTime;
    // Maintain a small buffer ahead of current time to prevent underruns
    if (this.audioScheduledTime < now + 0.015) {
      this.audioScheduledTime = now + 0.025;
    }

    source.start(this.audioScheduledTime);
    this.audioScheduledTime += audioBuf.duration;
  }
}
