/**
 * ZX Spectrum 48K Web Application Controller
 * Handles UI interactions, Canvas 32-bit blitting, Game Library, Tape Deck,
 * Drag & Drop snapshots, CRT scanlines, Quick Save/Load, and Debugger.
 */

import { ZXSpectrum, SPECTRUM_PALETTE } from './spectrum.js';
import { BUILTIN_GAMES } from './games.js';
import { SpectrumDebugger } from './debugger.js';

class SpectrumApp {
  constructor() {
    this.spectrum = new ZXSpectrum();
    this.debugger = new SpectrumDebugger(this.spectrum);

    // Canvas & Context
    this.canvas = document.getElementById('spectrum-screen');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.imgData = this.ctx.createImageData(320, 240);
    this.screenBuffer32 = new Uint32Array(this.imgData.data.buffer);

    // UI state
    this.crtFilterEnabled = true;
    this.currentScale = 'fit';
    this.selectedGame = null;
    this.activeDrawer = null;
    this.quickSaveSlots = JSON.parse(localStorage.getItem('zx_quicksave_slots') || '{}');

    // FPS calculation
    this.fpsCounter = 0;
    this.currentFps = 50;
    this.fpsTimer = performance.now();

    // Virtual keyboard shifts
    this.capsShiftActive = false;
    this.symbolShiftActive = false;

    // Connect Spectrum frame callback
    this.spectrum.onFrameCallback = (buf) => this.onFrame(buf);

    this.initUI();
    this.initKeyboard();
    this.initFileDrop();
    this.initVirtualKeyboard();
    this.renderGameLibrary();
    this.updateQuickSaveUI();

    // Initialize ROM (loads 48k.rom if present)
    this.spectrum.initROM();

    // Start emulator
    this.spectrum.start();

    // Regular debugger updater
    setInterval(() => {
      if (this.activeDrawer === 'debugger') {
        this.updateDebuggerUI();
      }
    }, 100);
  }

  onFrame(frameBuffer) {
    // 32-bit direct pixel copy to Canvas ImageData buffer
    this.screenBuffer32.set(frameBuffer);
    this.ctx.putImageData(this.imgData, 0, 0);

    // Calculate FPS
    this.fpsCounter++;
    const now = performance.now();
    if (now - this.fpsTimer >= 1000) {
      this.currentFps = Math.round((this.fpsCounter * 1000) / (now - this.fpsTimer));
      this.fpsCounter = 0;
      this.fpsTimer = now;
      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = `${this.currentFps} FPS`;
    }
  }

  initUI() {
    // Play/Pause
    const playPauseBtn = document.getElementById('btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (this.spectrum.paused) {
          this.spectrum.resume();
          playPauseBtn.innerHTML = '<span class="icon">⏸</span> Pause';
          playPauseBtn.classList.remove('active');
        } else {
          this.spectrum.pause();
          playPauseBtn.innerHTML = '<span class="icon">▶</span> Run';
          playPauseBtn.classList.add('active');
        }
      });
    }

    // Reset
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.spectrum.reset();
        this.showToast('ZX Spectrum 48K Reset (Sinclair BASIC 1982)');
      });
    }

    // NMI
    const nmiBtn = document.getElementById('btn-nmi');
    if (nmiBtn) {
      nmiBtn.addEventListener('click', () => {
        this.spectrum.cpu.nmi();
        this.showToast('Non-Maskable Interrupt (NMI) triggered');
      });
    }

    // Speed Selector
    const speedSelect = document.getElementById('speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        const spd = parseFloat(e.target.value);
        this.spectrum.setSpeed(spd);
        this.showToast(`Speed set to ${spd}x (${(spd * 3.5).toFixed(1)} MHz)`);
      });
    }

    // Audio Mute & Volume
    const muteBtn = document.getElementById('btn-mute');
    const volumeSlider = document.getElementById('volume-slider');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const isMuted = !this.spectrum.audio.enabled;
        this.spectrum.audio.setMuted(!isMuted);
        muteBtn.innerHTML = isMuted ? '🔊' : '🔇';
        muteBtn.classList.toggle('muted', !isMuted);
      });
    }
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.spectrum.audio.setVolume(val);
      });
    }

    // CRT Scanlines Toggle
    const crtToggle = document.getElementById('btn-crt-toggle');
    const crtOverlay = document.getElementById('crt-overlay');
    if (crtToggle && crtOverlay) {
      crtToggle.addEventListener('click', () => {
        this.crtFilterEnabled = !this.crtFilterEnabled;
        crtOverlay.classList.toggle('hidden', !this.crtFilterEnabled);
        crtToggle.classList.toggle('active', this.crtFilterEnabled);
        this.showToast(`CRT Filter ${this.crtFilterEnabled ? 'Enabled' : 'Disabled'}`);
      });
    }

    // Screen Scale Mode (Fit / Integer 2x / 3x / Fullscreen)
    const scaleSelect = document.getElementById('scale-select');
    const screenWrapper = document.getElementById('screen-wrapper');
    if (scaleSelect && screenWrapper) {
      scaleSelect.addEventListener('change', (e) => {
        this.currentScale = e.target.value;
        screenWrapper.className = `screen-wrapper scale-${this.currentScale}`;
      });
    }

    // Fullscreen Button
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    if (fullscreenBtn && screenWrapper) {
      fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          screenWrapper.requestFullscreen().catch(err => console.warn(err));
        } else {
          document.exitFullscreen();
        }
      });
    }

    // Tape Deck Actions
    const tapeAutoLoadBtn = document.getElementById('btn-tape-autoload');
    const tapeRewindBtn = document.getElementById('btn-tape-rewind');
    if (tapeAutoLoadBtn) {
      tapeAutoLoadBtn.addEventListener('click', () => {
        if (this.currentTapeData) {
          this.closeDrawers();
          this.spectrum.autoLoadTAP(this.currentTapeData, this.currentTapeFilename);
          this.showToast(`Auto-Loading ${this.currentTapeFilename}...`);
        } else {
          this.showToast('Please load a .TAP file first!', true);
        }
      });
    }
    if (tapeRewindBtn) {
      tapeRewindBtn.addEventListener('click', () => {
        this.spectrum.rewindTape();
        this.updateTapeProgress(0, (this.spectrum.tapeBlocks || []).length);
        this.showToast('Tape rewound to start');
      });
    }

    // Connect tape block loaded callback
    this.spectrum.onTapeBlockLoaded = (idx, total, block) => {
      this.updateTapeProgress(idx, total, block);
    };

    // Drawer Toggles
    const drawers = ['games', 'tape', 'debugger', 'basic', 'settings'];
    drawers.forEach(id => {
      const btn = document.getElementById(`btn-open-${id}`);
      if (btn) {
        btn.addEventListener('click', () => this.toggleDrawer(id));
      }
      const closeBtn = document.getElementById(`btn-close-${id}`);
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeDrawers());
      }
    });

    // Automatically blur buttons/selects after interaction so they don't capture game keys
    document.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.closest('button')) {
        setTimeout(() => {
          if (document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            document.activeElement.blur();
          }
        }, 50);
      }
    });

    const screenWrapperEl = document.getElementById('screen-wrapper');
    if (screenWrapperEl) {
      screenWrapperEl.addEventListener('click', () => {
        this.spectrum.audio.init();
        this.spectrum.audio.resume();
        if (document.activeElement) document.activeElement.blur();
      });
    }

    // Mobile Virtual D-Pad
    this.initMobileControls();

    // Quick Save / Load Hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'F5') {
        e.preventDefault();
        this.quickSave(1);
      } else if (e.key === 'F9') {
        e.preventDefault();
        this.quickLoad(1);
      }
    });
  }

  initKeyboard() {
    const handleKeyDown = (e) => {
      // Don't capture when typing in text fields or search boxes
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Blur any active button or dropdown so game keys aren't captured by UI controls
      if (document.activeElement && document.activeElement !== document.body &&
          document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        document.activeElement.blur();
      }

      // Prevent default browser scrolling and shortcut activation on game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Enter', 'Escape'].includes(e.code) ||
          e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      // Resume audio on first interaction
      this.spectrum.audio.init();
      this.spectrum.audio.resume();

      this.spectrum.keyboard.keyDown(e.code, e.key);

      // Highlight virtual keyboard key if visible
      this.highlightVirtualKey(e.code, true);
    };

    const handleKeyUp = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Enter', 'Escape'].includes(e.code) ||
          e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      this.spectrum.keyboard.keyUp(e.code, e.key);
      this.highlightVirtualKey(e.code, false);
    };

    // Use capture phase so no child element can intercept or swallow game keystrokes
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
  }

  initFileDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    const handleFile = (file) => {
      if (!file) return;
      const reader = new FileReader();
      const filename = file.name.toLowerCase();

      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        try {
          // Automatically close any open drawer/sidebar to unblur screen
          this.closeDrawers();

          if (filename.endsWith('.sna')) {
            this.spectrum.loadSNA(data);
            this.showToast(`Loaded SNA: ${file.name}`);
          } else if (filename.endsWith('.rom') || (data.length === 16384 && !filename.includes('.'))) {
            this.spectrum.setROM(data);
            this.showToast(`Loaded Sinclair ROM: ${file.name} (16KB)`);
          } else if (filename.endsWith('.z80')) {
            this.spectrum.loadZ80(data);
            this.showToast(`Loaded Z80: ${file.name}`);
          } else if (filename.endsWith('.tap')) {
            this.currentTapeData = data;
            this.currentTapeFilename = file.name;
            const blocks = this.spectrum.parseTAP(data);
            this.spectrum.autoLoadTAP(data, file.name);
            this.updateTapeDeckUI(blocks, file.name);
            this.showToast(`Auto-Loading TAP: ${file.name} (${blocks.length} blocks)`);
          } else if (filename.endsWith('.scr')) {
            // Load 6912 byte direct screen dump
            for (let i = 0; i < Math.min(data.length, 6912); i++) {
              this.spectrum.memory[0x4000 + i] = data[i];
            }
            this.showToast(`Loaded SCR screenshot: ${file.name}`);
          } else {
            // Try detecting SNA length
            if (data.length === 49179) {
              this.spectrum.loadSNA(data);
              this.showToast(`Loaded Snapshot: ${file.name}`);
            } else {
              this.showToast(`Unsupported format: ${file.name}`, true);
            }
          }
        } catch (err) {
          console.error('File load error:', err);
          this.showToast(`Failed to load: ${err.message}`, true);
        }
      };

      reader.readAsArrayBuffer(file);
    };

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFile(e.target.files[0]);
        }
      });
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Also support dropping anywhere on canvas/screen
    const screenWrapper = document.getElementById('screen-wrapper');
    if (screenWrapper) {
      screenWrapper.addEventListener('dragover', (e) => e.preventDefault());
      screenWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }
  }

  initVirtualKeyboard() {
    const keys = document.querySelectorAll('.rubber-key');
    keys.forEach(k => {
      const row = parseInt(k.getAttribute('data-row'), 10);
      const bit = parseInt(k.getAttribute('data-bit'), 10);
      const keyId = k.getAttribute('data-key');

      const handlePress = (e) => {
        e.preventDefault();
        this.spectrum.audio.init();
        this.spectrum.audio.resume();

        if (keyId === 'caps_shift') {
          this.capsShiftActive = !this.capsShiftActive;
          k.classList.toggle('latched', this.capsShiftActive);
          if (this.capsShiftActive) this.spectrum.keyboard.pressSpectrumKey(3, 0);
          else this.spectrum.keyboard.releaseSpectrumKey(3, 0);
          return;
        }

        if (keyId === 'symbol_shift') {
          this.symbolShiftActive = !this.symbolShiftActive;
          k.classList.toggle('latched', this.symbolShiftActive);
          if (this.symbolShiftActive) this.spectrum.keyboard.pressSpectrumKey(7, 1);
          else this.spectrum.keyboard.releaseSpectrumKey(7, 1);
          return;
        }

        k.classList.add('pressed');
        this.spectrum.keyboard.pressSpectrumKey(row, bit);
      };

      const handleRelease = (e) => {
        e.preventDefault();
        if (keyId === 'caps_shift' || keyId === 'symbol_shift') return;
        k.classList.remove('pressed');
        this.spectrum.keyboard.releaseSpectrumKey(row, bit);

        // Auto release latch shifts if standard key was clicked
        if (this.capsShiftActive) {
          this.capsShiftActive = false;
          this.spectrum.keyboard.releaseSpectrumKey(3, 0);
          const capsKey = document.querySelector('[data-key="caps_shift"]');
          if (capsKey) capsKey.classList.remove('latched');
        }
        if (this.symbolShiftActive) {
          this.symbolShiftActive = false;
          this.spectrum.keyboard.releaseSpectrumKey(7, 1);
          const symKey = document.querySelector('[data-key="symbol_shift"]');
          if (symKey) symKey.classList.remove('latched');
        }
      };

      k.addEventListener('mousedown', handlePress);
      k.addEventListener('mouseup', handleRelease);
      k.addEventListener('mouseleave', handleRelease);
      k.addEventListener('touchstart', handlePress, { passive: false });
      k.addEventListener('touchend', handleRelease, { passive: false });
    });
  }

  highlightVirtualKey(code, isPressed) {
    const keyMap = {
      'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
      'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',
      'KeyQ': 'q', 'KeyW': 'w', 'KeyE': 'e', 'KeyR': 'r', 'KeyT': 't',
      'KeyY': 'y', 'KeyU': 'u', 'KeyI': 'i', 'KeyO': 'o', 'KeyP': 'p',
      'KeyA': 'a', 'KeyS': 's', 'KeyD': 'd', 'KeyF': 'f', 'KeyG': 'g',
      'KeyH': 'h', 'KeyJ': 'j', 'KeyK': 'k', 'KeyL': 'l', 'Enter': 'enter',
      'ShiftLeft': 'caps_shift', 'KeyZ': 'z', 'KeyX': 'x', 'KeyC': 'c', 'KeyV': 'v',
      'KeyB': 'b', 'KeyN': 'n', 'KeyM': 'm', 'ControlLeft': 'symbol_shift',
      'ShiftRight': 'symbol_shift', 'Space': 'space'
    };

    const keyName = keyMap[code];
    if (keyName) {
      const el = document.querySelector(`[data-key="${keyName}"]`);
      if (el) {
        if (isPressed) el.classList.add('pressed');
        else el.classList.remove('pressed');
      }
    }
  }

  initMobileControls() {
    const dpadButtons = [
      { id: 'dpad-up', bit: 3 },
      { id: 'dpad-down', bit: 2 },
      { id: 'dpad-left', bit: 1 },
      { id: 'dpad-right', bit: 0 },
      { id: 'btn-fire', bit: 4 }
    ];

    dpadButtons.forEach(btn => {
      const el = document.getElementById(btn.id);
      if (!el) return;

      const press = (e) => {
        e.preventDefault();
        this.spectrum.audio.init();
        this.spectrum.audio.resume();
        this.spectrum.keyboard.setKempstonBit(btn.bit, true);
        if (btn.id === 'btn-fire') this.spectrum.keyboard.pressSpectrumKey(7, 0); // Space / Fire
        else if (btn.id === 'dpad-left') this.spectrum.keyboard.pressSpectrumKey(5, 1); // 'O'
        else if (btn.id === 'dpad-right') this.spectrum.keyboard.pressSpectrumKey(5, 0); // 'P'
        else if (btn.id === 'dpad-up') this.spectrum.keyboard.pressSpectrumKey(1, 0); // 'Q'
        else if (btn.id === 'dpad-down') this.spectrum.keyboard.pressSpectrumKey(2, 0); // 'A'
        el.classList.add('active');
      };
      const release = (e) => {
        e.preventDefault();
        this.spectrum.keyboard.setKempstonBit(btn.bit, false);
        if (btn.id === 'btn-fire') this.spectrum.keyboard.releaseSpectrumKey(7, 0);
        else if (btn.id === 'dpad-left') this.spectrum.keyboard.releaseSpectrumKey(5, 1);
        else if (btn.id === 'dpad-right') this.spectrum.keyboard.releaseSpectrumKey(5, 0);
        else if (btn.id === 'dpad-up') this.spectrum.keyboard.releaseSpectrumKey(1, 0);
        else if (btn.id === 'dpad-down') this.spectrum.keyboard.releaseSpectrumKey(2, 0);
        el.classList.remove('active');
      };

      el.addEventListener('mousedown', press);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
    });
  }

  renderGameLibrary() {
    const listEl = document.getElementById('games-grid');
    if (!listEl) return;

    listEl.innerHTML = '';
    BUILTIN_GAMES.forEach(game => {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="game-card-header">
          <div class="game-tag">${game.category}</div>
          <div class="game-year">${game.year}</div>
        </div>
        <h3 class="game-title">${game.title}</h3>
        <p class="game-author">By ${game.author}</p>
        <p class="game-desc">${game.description}</p>
        <div class="game-controls"><strong>Controls:</strong> ${game.controls}</div>
        <button class="btn-primary btn-launch" data-game-id="${game.id}">
          <span>▶</span> Launch
        </button>
      `;

      const launchBtn = card.querySelector('.btn-launch');
      launchBtn.addEventListener('click', () => {
        this.launchGame(game);
      });

      listEl.appendChild(card);
    });
  }

  launchGame(game) {
    this.closeDrawers();
    if (game.type === 'reset') {
      this.spectrum.reset();
    } else if (game.setup) {
      game.setup(this.spectrum);
    }
    this.showToast(`Launched: ${game.title}`);
  }

  downloadSnapshot() {
    const snaBytes = this.spectrum.saveSNA();
    const blob = new Blob([snaBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zxspectrum_snap_${Date.now()}.sna`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('Snapshot .SNA saved and downloaded!');
  }

  quickSave(slot = 1) {
    const data = Array.from(this.spectrum.saveSNA());
    this.quickSaveSlots[slot] = {
      timestamp: new Date().toLocaleTimeString(),
      data: data
    };
    localStorage.setItem('zx_quicksave_slots', JSON.stringify(this.quickSaveSlots));
    this.updateQuickSaveUI();
    this.showToast(`Quick Saved to Slot ${slot} (${this.quickSaveSlots[slot].timestamp})`);
  }

  quickLoad(slot = 1) {
    const item = this.quickSaveSlots[slot];
    if (item && item.data) {
      const bytes = new Uint8Array(item.data);
      this.spectrum.loadSNA(bytes);
      this.showToast(`Quick Loaded Slot ${slot} (${item.timestamp})`);
    } else {
      this.showToast(`Slot ${slot} is empty!`, true);
    }
  }

  updateQuickSaveUI() {
    for (let slot = 1; slot <= 3; slot++) {
      const slotEl = document.getElementById(`slot-info-${slot}`);
      if (slotEl) {
        const item = this.quickSaveSlots[slot];
        slotEl.textContent = item ? `Saved: ${item.timestamp}` : 'Empty';
      }
      const saveBtn = document.getElementById(`btn-save-slot-${slot}`);
      const loadBtn = document.getElementById(`btn-load-slot-${slot}`);
      if (saveBtn) saveBtn.onclick = () => this.quickSave(slot);
      if (loadBtn) loadBtn.onclick = () => this.quickLoad(slot);
    }
  }

  updateTapeDeckUI(blocks, filename) {
    const container = document.getElementById('tape-blocks-list');
    const titleEl = document.getElementById('tape-filename');
    const badgeEl = document.getElementById('tape-progress-badge');
    if (titleEl) titleEl.textContent = filename || 'No Tape Loaded';
    if (badgeEl) badgeEl.textContent = `0 / ${blocks.length}`;
    if (!container) return;

    container.innerHTML = '';
    blocks.forEach((b, idx) => {
      const row = document.createElement('div');
      row.className = 'tape-block-row';
      row.id = `tape-block-${idx}`;
      row.innerHTML = `
        <span class="block-num">#${idx + 1}</span>
        <span class="block-type">${b.type}</span>
        <span class="block-name">${b.name}</span>
        <span class="block-size">${b.size} bytes</span>
      `;
      container.appendChild(row);
    });
  }

  updateTapeProgress(idx, total, block) {
    const badgeEl = document.getElementById('tape-progress-badge');
    if (badgeEl) badgeEl.textContent = `${idx} / ${total}`;

    // Update spool animation or highlight row
    document.querySelectorAll('.tape-block-row').forEach((row, rIdx) => {
      row.classList.toggle('active', rIdx === idx - 1);
      row.classList.toggle('loaded', rIdx < idx);
    });

    if (block) {
      this.showToast(`Tape loaded: ${block.name || block.type} (${idx}/${total})`);
    }
  }

  updateDebuggerUI() {
    const state = this.debugger.getState();

    // Update registers
    const regIds = ['pc', 'sp', 'af', 'bc', 'de', 'hl', 'ix', 'iy', 'af_', 'bc_', 'de_', 'hl_', 'i', 'r', 'im'];
    regIds.forEach(id => {
      const el = document.getElementById(`dbg-reg-${id}`);
      if (el) el.textContent = state[id];
    });

    // Update flags
    const flagIds = ['s', 'z', 'y', 'h', 'x', 'pv', 'n', 'c'];
    flagIds.forEach(f => {
      const el = document.getElementById(`dbg-flag-${f}`);
      if (el) {
        el.textContent = state.flags[f];
        el.className = `dbg-flag ${state.flags[f] ? 'set' : 'clear'}`;
      }
    });

    // Update Disassembly
    const disasmEl = document.getElementById('dbg-disassembly');
    if (disasmEl) {
      const lines = this.debugger.disassemble(this.spectrum.cpu.pc, 10);
      disasmEl.innerHTML = lines.map(l => `
        <div class="disasm-line ${l.isPC ? 'current-pc' : ''}">
          <span class="disasm-addr">${l.addr}</span>
          <span class="disasm-bytes">${l.bytes}</span>
          <span class="disasm-mnemonic">${l.mnemonic}</span>
        </div>
      `).join('');
    }

    // Update Memory Hex dump
    const hexEl = document.getElementById('dbg-hexdump');
    if (hexEl) {
      const memAddrInput = document.getElementById('dbg-mem-addr');
      const startAddr = parseInt((memAddrInput && memAddrInput.value) || '0x4000', 16) || 0x4000;
      const dumpRows = this.debugger.getHexDump(startAddr, 64);
      hexEl.innerHTML = dumpRows.map(r => `
        <div class="hex-row">
          <span class="hex-addr">${r.addr}</span>
          <span class="hex-bytes">${r.bytes}</span>
          <span class="hex-ascii">${r.ascii}</span>
        </div>
      `).join('');
    }
  }

  toggleDrawer(id) {
    if (this.activeDrawer === id) {
      this.closeDrawers();
      return;
    }

    this.closeDrawers();
    const drawer = document.getElementById(`drawer-${id}`);
    const backdrop = document.getElementById('drawer-backdrop');
    if (drawer) {
      drawer.classList.add('open');
      this.activeDrawer = id;
      if (backdrop) backdrop.classList.add('visible');

      if (id === 'debugger') {
        this.updateDebuggerUI();
      }
    }
  }

  closeDrawers() {
    document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
    const backdrop = document.getElementById('drawer-backdrop');
    if (backdrop) backdrop.classList.remove('visible');
    this.activeDrawer = null;
  }

  showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = msg;
    toast.className = `toast show ${isError ? 'error' : ''}`;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.className = 'toast';
    }, 3000);
  }
}

// Instantiate when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.spectrumApp = new SpectrumApp();
});
