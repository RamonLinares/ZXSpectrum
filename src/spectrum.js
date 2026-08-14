/**
 * ZX Spectrum 48K System Hardware Emulation
 * Integrates Z80 CPU, ULA Video Rendering, Port 0xFE, Beeper Audio,
 * Keyboard Matrix, Kempston Joystick, and SNA/Z80/TAP file loaders.
 */

import { Z80 } from './z80.js';
import { loadSpectrumROM, createMinimalBootROM, SPECTRUM_BOOT_STATE } from './rom.js';
import { SpectrumAudio } from './audio.js';
import { SpectrumKeyboard } from './keyboard.js';

export const SPECTRUM_PALETTE = [
  // Normal (BRIGHT 0)
  0xff000000, // Black
  0xffd70000, // Blue (ABGR format for 32-bit canvas Uint32Array)
  0xff0000d7, // Red
  0xffd700d7, // Magenta
  0xff00d700, // Green
  0xffd7d700, // Cyan
  0xff00d7d7, // Yellow
  0xffd7d7d7, // White

  // Bright (BRIGHT 1)
  0xff000000, // Bright Black
  0xffff0000, // Bright Blue
  0xff0000ff, // Bright Red
  0xffff00ff, // Bright Magenta
  0xff00ff00, // Bright Green
  0xffffff00, // Bright Cyan
  0xff00ffff, // Bright Yellow
  0xffffffff  // Bright White
];

export class ZXSpectrum {
  constructor() {
    // 64KB Address Space (16KB ROM + 48KB RAM)
    this.memory = new Uint8Array(65536);
    this.rom = createMinimalBootROM();
    this.loadROM();

    // Peripherals
    this.audio = new SpectrumAudio();
    this.keyboard = new SpectrumKeyboard();

    // CPU
    this.cpu = new Z80(this);

    // ULA State
    this.borderColor = 7; // White border by default
    this.beeperState = 0;
    this.micState = 0;
    this.earState = 0;

    // Frame timing: 3.5MHz clock / 50Hz = 69,888 T-states per frame
    this.TSTATES_PER_FRAME = 69888;
    this.frameCounter = 0;
    this.flashState = false;

    // Video display buffer: 320x240 (256x192 screen + 32px border left/right, 24px border top/bottom)
    this.displayWidth = 320;
    this.displayHeight = 240;
    this.borderLeft = 32;
    this.borderRight = 32;
    this.borderTop = 24;
    this.borderBottom = 24;

    this.screenBuffer = new Uint32Array(this.displayWidth * this.displayHeight);

    // Audio sampling: 882 samples per frame (44100 / 50)
    this.audioSamplesPerFrame = 882;
    this.audioFrameBuffer = new Float32Array(this.audioSamplesPerFrame);
    this.audioEvents = []; // Timestamped beeper changes: { tstate, level }

    // Precalculate scanline address table for fast 256x192 rendering
    this.scanlineOffsets = new Uint16Array(192);
    for (let y = 0; y < 192; y++) {
      const block = (y >> 6) & 3;
      const row = (y >> 3) & 7;
      const line = y & 7;
      this.scanlineOffsets[y] = 0x4000 + (block << 11) + (line << 8) + (row << 5);
    }

    // Performance & Execution state
    this.running = false;
    this.paused = false;
    this.speedMultiplier = 1.0;
    this.fps = 50;
    this.lastFrameTime = 0;
    this.totalFramesRendered = 0;
    this.onFrameCallback = null;

    // Tape loading state
    this.tapeData = null;
    this.tapeBlocks = [];
    this.tapeBlockIndex = 0;
    this.tapeTrapEnabled = true;
    this.onTapeBlockLoaded = null;

    // Automated keystroke queue for typing commands
    this.keyQueue = [];
    this.keyWait = 0;
    this.keyHold = 0;

    // Reset CPU to clean boot prompt
    this.bootClean();
  }

  async initROM() {
    this.rom = await loadSpectrumROM();
    this.loadROM();
    this.bootClean();
  }

  setROM(romBytes) {
    if (romBytes && romBytes.length >= 16384) {
      this.rom = romBytes.slice(0, 16384);
      this.loadROM();
      this.bootClean();
    }
  }

  loadROM() {
    for (let i = 0; i < 16384; i++) {
      this.memory[i] = this.rom[i];
    }
  }

  /**
   * Resets the ZX Spectrum hardware to initial power-on state
   */
  bootClean() {
    this.loadROM();
    this.keyboard.reset();
    this.keyQueue = [];
    this.keyWait = 0;
    this.keyHold = 0;

    if (SPECTRUM_BOOT_STATE && SPECTRUM_BOOT_STATE.ram_b64) {
      const binary = typeof atob === 'function' ? atob(SPECTRUM_BOOT_STATE.ram_b64) : Buffer.from(SPECTRUM_BOOT_STATE.ram_b64, 'base64').toString('binary');
      for (let i = 0; i < 49152; i++) {
        this.memory[0x4000 + i] = binary.charCodeAt(i);
      }
      Object.assign(this.cpu, SPECTRUM_BOOT_STATE.cpu);
      this.borderColor = SPECTRUM_BOOT_STATE.border;
    } else {
      for (let i = 0x4000; i < 65536; i++) {
        this.memory[i] = 0;
      }
      this.cpu.reset();
      this.borderColor = 7;
    }

    this.beeperState = 0;
    this.micState = 0;
    this.earState = 0;
    this.frameCounter = 0;
    this.flashState = false;
    this.audioEvents = [];
  }

  reset() {
    this.bootClean();
  }

  /**
   * Handle Sinclair ROM LD-BYTES trap (0x0556 / 0x0562) for instant TAP loading
   */
  handleTapeTrap(isEntry0562 = false) {
    if (!this.tapeBlocks || this.tapeBlockIndex >= this.tapeBlocks.length) {
      this.cpu.f &= ~0x01; // Clear Carry flag (EOF/Error)
      if (isEntry0562) this.cpu.popWord();
      this.cpu.pc = this.cpu.popWord();
      this.cpu.tstates += 500;
      return;
    }

    const expectedFlag = this.cpu.a_ & 0xff;
    let block = null;

    // Find next matching block
    while (this.tapeBlockIndex < this.tapeBlocks.length) {
      const candidate = this.tapeBlocks[this.tapeBlockIndex];
      if (candidate.flag === expectedFlag || candidate.data.length === (this.cpu.de + 2)) {
        block = candidate;
        this.tapeBlockIndex++;
        break;
      }
      this.tapeBlockIndex++;
    }

    if (!block && this.tapeBlocks.length > 0) {
      block = this.tapeBlocks[Math.min(this.tapeBlockIndex, this.tapeBlocks.length - 1)];
      this.tapeBlockIndex++;
    }

    if (block && block.data && block.data.length > 1) {
      const targetAddr = this.cpu.ix;
      const expectedLen = this.cpu.de;
      const payloadLen = Math.max(0, block.data.length - 2); // Exclude flag byte & checksum
      const copyLen = Math.min(expectedLen, payloadLen);

      // Copy bytes directly to target memory address
      for (let i = 0; i < copyLen; i++) {
        this.writeByte((targetAddr + i) & 0xffff, block.data[1 + i]);
      }

      // Update Z80 registers
      this.cpu.ix = (this.cpu.ix + copyLen) & 0xffff;
      this.cpu.de = (this.cpu.de - copyLen) & 0xffff;

      // Set Carry flag (1 = Success), Zero flag (1), Subtract (0)
      this.cpu.f = (this.cpu.f | 0x01 | 0x40) & ~0x02;
      this.cpu.a = 0;

      // Toggle border color for visual tape loading stripe effect
      this.borderColor = (this.borderColor === 1) ? 2 : 1;

      if (this.onTapeBlockLoaded) {
        this.onTapeBlockLoaded(this.tapeBlockIndex, this.tapeBlocks.length, block);
      }
    } else {
      this.cpu.f &= ~0x01;
    }

    if (isEntry0562) {
      this.cpu.popWord(); // pop 0x053F error address
    }
    this.cpu.pc = this.cpu.popWord(); // return to caller
    this.cpu.tstates += 500;
  }

  // Memory interface for Z80
  readByte(addr) {
    return this.memory[addr & 0xffff];
  }

  writeByte(addr, val) {
    addr &= 0xffff;
    // 0x0000 - 0x3FFF is ROM (read only)
    if (addr >= 0x4000) {
      this.memory[addr] = val & 0xff;
    }
  }

  // Port interface for Z80
  readPort(port, tstateOffset = 0) {
    port &= 0xffff;

    // Port 0xFE: Keyboard & EAR
    if ((port & 0x01) === 0x00) {
      const keys = this.keyboard.readPortFE(port);
      const ear = this.earState ? 0x00 : 0x40; // Bit 6 idle is high (pull-up)
      return (keys & 0x1f) | ear | 0xa0; // Bits 5, 7 typically high
    }

    // Port 0x1F: Kempston Joystick
    if ((port & 0xff) === 0x1f) {
      return this.keyboard.readKempston();
    }

    // Unattached odd ports expose the byte currently being fetched by the ULA.
    return this.readFloatingBus(tstateOffset);
  }

  /**
   * Return the 48K ULA floating-bus value at the requested point in the frame.
   * The display fetch sequence begins at T-state 14347. Each 8T group fetches
   * bitmap, attribute, the next bitmap and attribute, then leaves the bus idle
   * for 4T. The rest of each 224T scanline is also idle.
   */
  readFloatingBus(tstateOffset = 0) {
    const frameTstate = ((this.cpu.tstates + tstateOffset) % this.TSTATES_PER_FRAME +
      this.TSTATES_PER_FRAME) % this.TSTATES_PER_FRAME;
    const displayTstate = frameTstate - 14347;

    if (displayTstate < 0 || displayTstate >= 192 * 224) return 0xff;

    const y = Math.floor(displayTstate / 224);
    const lineTstate = displayTstate % 224;
    if (lineTstate >= 128) return 0xff;

    const phase = lineTstate & 0x07;
    if (phase >= 4) return 0xff;

    const xByte = ((lineTstate >> 3) << 1) + (phase >> 1);
    let address;
    if (phase & 1) {
      address = 0x5800 | ((y >> 3) << 5) | xByte;
    } else {
      address = 0x4000 | ((y & 0xc0) << 5) | ((y & 0x07) << 8) |
        ((y & 0x38) << 2) | xByte;
    }

    return this.memory[address];
  }

  writePort(port, val) {
    port &= 0xffff;

    // Port 0xFE: Border, MIC, Beeper
    if ((port & 0x01) === 0x00) {
      this.borderColor = val & 0x07;
      this.micState = (val >> 3) & 1;
      const newBeeper = (val >> 4) & 1;

      if (newBeeper !== this.beeperState) {
        this.beeperState = newBeeper;
        this.audioEvents.push({
          tstate: this.cpu.tstates,
          level: newBeeper ? 0.7 : -0.7
        });
      }
    }
  }

  /**
   * Run a single 50Hz frame (69,888 T-states)
   */
  runFrame() {
    // Process automated keystroke queue (e.g. For auto-loading)
    if (this.keyQueue.length > 0) {
      if (this.keyWait > 0) {
        this.keyWait--;
      } else if (this.keyHold > 0) {
        this.keyHold--;
        if (this.keyHold === 0) {
          this.keyboard.reset();
          this.keyWait = 6;
        }
      } else {
        const k = this.keyQueue.shift();
        if (k.sym) this.keyboard.pressSpectrumKey(7, 1); // Symbol Shift
        this.keyboard.pressSpectrumKey(k.row, k.bit);
        this.keyHold = 5;
      }
    }

    this.audioEvents = [];
    let initialLevel = this.beeperState ? 0.7 : -0.7;
    this.audioEvents.push({ tstate: 0, level: initialLevel });

    let targetTstates = this.TSTATES_PER_FRAME;
    this.cpu.tstates = 0;

    // Execute CPU until 69888 T-states elapsed
    while (this.cpu.tstates < targetTstates) {
      if (this.tapeTrapEnabled && this.tapeBlocks && this.tapeBlocks.length > 0 &&
          (this.cpu.pc === 0x0556 || this.cpu.pc === 0x0562)) {
        this.handleTapeTrap(this.cpu.pc === 0x0562);
      }
      this.cpu.step();
    }

    // Trigger maskable 50Hz VBLANK interrupt (IM 1)
    this.cpu.interrupt();

    // Flash attribute updates every 16 frames (~320ms)
    this.frameCounter++;
    if ((this.frameCounter % 16) === 0) {
      this.flashState = !this.flashState;
    }

    // Render video frame to 320x240 screenBuffer
    this.renderScreen();

    // Synthesize frame audio
    this.synthesizeAudio();

    this.totalFramesRendered++;
    if (this.onFrameCallback) {
      this.onFrameCallback(this.screenBuffer);
    }
  }

  /**
   * Render 256x192 screen + border area into 320x240 32-bit screenBuffer
   */
  renderScreen() {
    const buf = this.screenBuffer;
    const borderRgb = SPECTRUM_PALETTE[this.borderColor];

    // 1. Fill top and bottom border
    const width = this.displayWidth;
    const height = this.displayHeight;

    // Top border
    for (let y = 0; y < this.borderTop; y++) {
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        buf[rowStart + x] = borderRgb;
      }
    }

    // Bottom border
    for (let y = height - this.borderBottom; y < height; y++) {
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        buf[rowStart + x] = borderRgb;
      }
    }

    // 2. Render 192 active scanlines + Left/Right border
    for (let y = 0; y < 192; y++) {
      const screenY = y + this.borderTop;
      const screenRowStart = screenY * width;

      // Left border
      for (let x = 0; x < this.borderLeft; x++) {
        buf[screenRowStart + x] = borderRgb;
      }

      // Right border
      for (let x = width - this.borderRight; x < width; x++) {
        buf[screenRowStart + x] = borderRgb;
      }

      // Active 256 pixels
      const lineAddr = this.scanlineOffsets[y];
      const attrRowAddr = 0x5800 + ((y >> 3) << 5);
      const activeRowStart = screenRowStart + this.borderLeft;

      for (let col = 0; col < 32; col++) {
        const pixels = this.memory[lineAddr + col];
        const attr = this.memory[attrRowAddr + col];

        const flash = (attr & 0x80) !== 0;
        const bright = (attr & 0x40) ? 8 : 0;
        let paperIdx = ((attr >> 3) & 0x07) | bright;
        let inkIdx = (attr & 0x07) | bright;

        if (flash && this.flashState) {
          const t = paperIdx;
          paperIdx = inkIdx;
          inkIdx = t;
        }

        const paperRgb = SPECTRUM_PALETTE[paperIdx];
        const inkRgb = SPECTRUM_PALETTE[inkIdx];

        const pixelX = activeRowStart + (col << 3);

        buf[pixelX]     = (pixels & 0x80) ? inkRgb : paperRgb;
        buf[pixelX + 1] = (pixels & 0x40) ? inkRgb : paperRgb;
        buf[pixelX + 2] = (pixels & 0x20) ? inkRgb : paperRgb;
        buf[pixelX + 3] = (pixels & 0x10) ? inkRgb : paperRgb;
        buf[pixelX + 4] = (pixels & 0x08) ? inkRgb : paperRgb;
        buf[pixelX + 5] = (pixels & 0x04) ? inkRgb : paperRgb;
        buf[pixelX + 6] = (pixels & 0x02) ? inkRgb : paperRgb;
        buf[pixelX + 7] = (pixels & 0x01) ? inkRgb : paperRgb;
      }
    }
  }

  /**
   * Synthesize audio from T-state events
   */
  synthesizeAudio() {
    const numSamples = this.audioSamplesPerFrame;
    const samples = this.audioFrameBuffer;
    const numEvents = this.audioEvents.length;

    let eventIdx = 0;
    let currentLevel = numEvents > 0 ? this.audioEvents[0].level : (this.beeperState ? 0.7 : -0.7);

    for (let i = 0; i < numSamples; i++) {
      const currentTstate = Math.floor((i / numSamples) * this.TSTATES_PER_FRAME);

      while (eventIdx + 1 < numEvents && this.audioEvents[eventIdx + 1].tstate <= currentTstate) {
        eventIdx++;
        currentLevel = this.audioEvents[eventIdx].level;
      }

      samples[i] = currentLevel;
    }

    this.audio.queueAudioFrame(samples);
  }

  /**
   * Load standard 48K .SNA Snapshot (49,179 bytes)
   * @param {Uint8Array} data
   */
  loadSNA(data) {
    if (data.length < 49179) {
      throw new Error(`Invalid SNA file length: ${data.length} bytes (expected 49,179)`);
    }

    this.reset();

    this.cpu.i = data[0];
    this.cpu.l_ = data[1];
    this.cpu.h_ = data[2];
    this.cpu.e_ = data[3];
    this.cpu.d_ = data[4];
    this.cpu.c_ = data[5];
    this.cpu.b_ = data[6];
    this.cpu.f_ = data[7];
    this.cpu.a_ = data[8];

    this.cpu.l = data[9];
    this.cpu.h = data[10];
    this.cpu.e = data[11];
    this.cpu.d = data[12];
    this.cpu.c = data[13];
    this.cpu.b = data[14];
    this.cpu.iy = data[15] | (data[16] << 8);
    this.cpu.ix = data[17] | (data[18] << 8);

    this.cpu.iff1 = (data[19] & 0x04) !== 0;
    this.cpu.iff2 = this.cpu.iff1;
    this.cpu.rReg = data[20];

    this.cpu.f = data[21];
    this.cpu.a = data[22];
    this.cpu.sp = data[23] | (data[24] << 8);
    this.cpu.im = data[25] & 0x03;
    this.borderColor = data[26] & 0x07;

    // Load 48KB RAM (0x4000 - 0xFFFF)
    for (let i = 0; i < 49152; i++) {
      this.memory[0x4000 + i] = data[27 + i];
    }

    // In 48K SNA, PC is popped from the top of the stack
    this.cpu.pc = this.cpu.popWord();
  }

  /**
   * Save current state to standard 48K .SNA Snapshot (49,179 bytes)
   * @returns {Uint8Array}
   */
  saveSNA() {
    const data = new Uint8Array(49179);

    // Push PC onto stack before saving SP and RAM
    const origSP = this.cpu.sp;
    this.cpu.pushWord(this.cpu.pc);

    data[0] = this.cpu.i;
    data[1] = this.cpu.l_;
    data[2] = this.cpu.h_;
    data[3] = this.cpu.e_;
    data[4] = this.cpu.d_;
    data[5] = this.cpu.c_;
    data[6] = this.cpu.b_;
    data[7] = this.cpu.f_;
    data[8] = this.cpu.a_;

    data[9] = this.cpu.l;
    data[10] = this.cpu.h;
    data[11] = this.cpu.e;
    data[12] = this.cpu.d;
    data[13] = this.cpu.c;
    data[14] = this.cpu.b;
    data[15] = this.cpu.iy & 0xff;
    data[16] = (this.cpu.iy >> 8) & 0xff;
    data[17] = this.cpu.ix & 0xff;
    data[18] = (this.cpu.ix >> 8) & 0xff;

    data[19] = this.cpu.iff2 ? 0x04 : 0x00;
    data[20] = this.cpu.rReg;
    data[21] = this.cpu.f;
    data[22] = this.cpu.a;
    data[23] = this.cpu.sp & 0xff;
    data[24] = (this.cpu.sp >> 8) & 0xff;
    data[25] = this.cpu.im;
    data[26] = this.borderColor;

    // 48KB RAM
    for (let i = 0; i < 49152; i++) {
      data[27 + i] = this.memory[0x4000 + i];
    }

    // Restore original SP
    this.cpu.sp = origSP;

    return data;
  }

  /**
   * Load .Z80 Snapshot (v1, v2, v3)
   * @param {Uint8Array} data
   */
  loadZ80(data) {
    if (data.length < 30) {
      throw new Error('Invalid Z80 snapshot file');
    }

    this.reset();

    this.cpu.a = data[0];
    this.cpu.f = data[1];
    this.cpu.c = data[2];
    this.cpu.b = data[3];
    this.cpu.l = data[4];
    this.cpu.h = data[5];

    let pc = data[6] | (data[7] << 8);
    this.cpu.sp = data[8] | (data[9] << 8);
    this.cpu.i = data[10];
    this.cpu.rReg = (data[11] & 0x7f) | ((data[12] & 0x01) << 7);

    const flags1 = data[12];
    this.borderColor = (flags1 >> 1) & 0x07;
    const isCompressed = (flags1 & 0x20) !== 0;

    this.cpu.e = data[13];
    this.cpu.d = data[14];
    this.cpu.c_ = data[15];
    this.cpu.b_ = data[16];
    this.cpu.e_ = data[17];
    this.cpu.d_ = data[18];
    this.cpu.l_ = data[19];
    this.cpu.h_ = data[20];
    this.cpu.a_ = data[21];
    this.cpu.f_ = data[22];
    this.cpu.iy = data[23] | (data[24] << 8);
    this.cpu.ix = data[25] | (data[26] << 8);
    this.cpu.iff1 = data[27] !== 0;
    this.cpu.iff2 = data[28] !== 0;
    this.cpu.im = data[29] & 0x03;

    if (pc !== 0) {
      // v1 format
      this.cpu.pc = pc;
      const memData = data.subarray(30);
      if (isCompressed) {
        this.decompressZ80Block(memData, 0x4000, 49152);
      } else {
        for (let i = 0; i < Math.min(memData.length, 49152); i++) {
          this.memory[0x4000 + i] = memData[i];
        }
      }
    } else {
      // v2 / v3 format
      const headerLength = data[30] | (data[31] << 8);
      this.cpu.pc = data[32] | (data[33] << 8);
      let offset = 32 + headerLength;

      while (offset < data.length) {
        if (offset + 3 > data.length) break;
        const blockLen = data[offset] | (data[offset + 1] << 8);
        const pageNum = data[offset + 2];
        offset += 3;

        let targetAddr = 0;
        if (pageNum === 4) targetAddr = 0x8000;
        else if (pageNum === 5) targetAddr = 0xC000;
        else if (pageNum === 8) targetAddr = 0x4000;

        if (blockLen === 0xffff) {
          // Uncompressed 16KB
          if (targetAddr) {
            for (let i = 0; i < 16384; i++) {
              this.memory[targetAddr + i] = data[offset + i];
            }
          }
          offset += 16384;
        } else {
          // Compressed block
          if (targetAddr) {
            this.decompressZ80Block(data.subarray(offset, offset + blockLen), targetAddr, 16384);
          }
          offset += blockLen;
        }
      }
    }
  }

  decompressZ80Block(src, destAddr, maxLen) {
    let srcIdx = 0;
    let destIdx = 0;
    while (srcIdx < src.length && destIdx < maxLen) {
      if (src[srcIdx] === 0xed && src[srcIdx + 1] === 0xed) {
        const count = src[srcIdx + 2];
        const val = src[srcIdx + 3];
        srcIdx += 4;
        for (let c = 0; c < count && destIdx < maxLen; c++) {
          this.memory[destAddr + destIdx++] = val;
        }
      } else {
        this.memory[destAddr + destIdx++] = src[srcIdx++];
      }
    }
  }

  /**
   * Parse .TAP Tape File into individual blocks
   * @param {Uint8Array} data
   */
  parseTAP(data) {
    this.tapeBlocks = [];
    let offset = 0;
    while (offset + 2 <= data.length) {
      const blockLength = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      if (offset + blockLength > data.length) break;

      const blockData = data.subarray(offset, offset + blockLength);
      const flag = blockData[0];
      const isHeader = (flag === 0x00);
      const isData = (flag === 0xff);

      let name = '';
      let type = 'Data';
      if (isHeader && blockLength >= 11) {
        const typeByte = blockData[1];
        if (typeByte === 0) type = 'Program';
        else if (typeByte === 1) type = 'Number Array';
        else if (typeByte === 2) type = 'Character Array';
        else if (typeByte === 3) type = 'Bytes';

        for (let i = 2; i <= 11; i++) {
          name += String.fromCharCode(blockData[i]);
        }
        name = name.trim();
      }

      this.tapeBlocks.push({
        flag,
        type,
        name: name || (isHeader ? 'Header' : 'Data Block'),
        size: blockLength,
        data: blockData
      });

      offset += blockLength;
    }

    return this.tapeBlocks;
  }

  /**
   * Mount and automatically load & execute a TAP file
   * @param {Uint8Array} data
   * @param {string} filename
   */
  autoLoadTAP(data, filename = '') {
    this.parseTAP(data);
    this.tapeBlockIndex = 0;
    this.tapeTrapEnabled = true;

    // Reset Spectrum to clean boot state (Sinclair BASIC prompt ready)
    this.bootClean();

    // Queue keystrokes: J (LOAD keyword), " (Symbol + P), " (Symbol + P), ENTER
    this.keyQueue = [
      { char: 'j', row: 6, bit: 3 }, // J -> LOAD
      { char: '"', row: 5, bit: 0, sym: true }, // " -> Symbol + P
      { char: '"', row: 5, bit: 0, sym: true }, // " -> Symbol + P
      { char: 'enter', row: 6, bit: 0 } // ENTER
    ];
    this.keyWait = 4;
    this.keyHold = 0;
  }

  /**
   * Rewind tape back to the first block
   */
  rewindTape() {
    this.tapeBlockIndex = 0;
  }

  /**
   * Start emulation loop
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.audio.init();
    this.audio.resume();

    let lastTime = performance.now();
    const frameInterval = 1000 / (50 * this.speedMultiplier);

    const loop = (currentTime) => {
      if (!this.running) return;

      if (!this.paused) {
        const elapsed = currentTime - lastTime;
        const targetInterval = 1000 / (50 * this.speedMultiplier);

        if (elapsed >= targetInterval) {
          lastTime = currentTime - (elapsed % targetInterval);
          this.runFrame();
        }
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.audio.resume();
  }

  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.2, Math.min(10.0, multiplier));
  }
}
