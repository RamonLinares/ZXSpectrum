/**
 * ZX Spectrum 48K Keyboard Matrix and Input Controller
 * Supports:
 * - 8x5 Matrix Port 0xFE emulation
 * - Physical keyboard mapping with smart symbol & cursor key translation
 * - Kempston & Sinclair Joystick mapping
 * - Interactive Virtual On-Screen Sinclair Rubber Keyboard
 */

export class SpectrumKeyboard {
  constructor() {
    // 8 half-rows, each has 5 bits (1 = unpressed, 0 = pressed). Initially all 0x1F (0b11111).
    this.matrix = new Uint8Array(8);
    this.pressedKeys = new Map();
    this.joystickKeys = new Map();
    this.manualKempston = 0;
    this.reset();

    // Kempston joystick state (0 = unpressed, 1 = pressed)
    this.kempston = 0;

    // Joystick mode: 'kempston', 'sinclair1', 'sinclair2', 'cursor'
    this.joystickMode = 'kempston';

    // Map keys to matrix (row, bit)
    // Row 0: 0xF7 (1, 2, 3, 4, 5)
    // Row 1: 0xFB (Q, W, E, R, T)
    // Row 2: 0xFD (A, S, D, F, G)
    // Row 3: 0xFE (CAPS, Z, X, C, V)
    // Row 4: 0xEF (0, 9, 8, 7, 6)
    // Row 5: 0xDF (P, O, I, U, Y)
    // Row 6: 0xBF (ENTER, L, K, J, H)
    // Row 7: 0x7F (SPACE, SYMBOL, M, N, B)
    this.keyMap = {
      // Numbers
      'Digit1': [{ r: 0, b: 0 }], 'Numpad1': [{ r: 0, b: 0 }], '1': [{ r: 0, b: 0 }],
      'Digit2': [{ r: 0, b: 1 }], 'Numpad2': [{ r: 0, b: 1 }], '2': [{ r: 0, b: 1 }],
      'Digit3': [{ r: 0, b: 2 }], 'Numpad3': [{ r: 0, b: 2 }], '3': [{ r: 0, b: 2 }],
      'Digit4': [{ r: 0, b: 3 }], 'Numpad4': [{ r: 0, b: 3 }], '4': [{ r: 0, b: 3 }],
      'Digit5': [{ r: 0, b: 4 }], 'Numpad5': [{ r: 0, b: 4 }], '5': [{ r: 0, b: 4 }],
      'Digit6': [{ r: 4, b: 4 }], 'Numpad6': [{ r: 4, b: 4 }], '6': [{ r: 4, b: 4 }],
      'Digit7': [{ r: 4, b: 3 }], 'Numpad7': [{ r: 4, b: 3 }], '7': [{ r: 4, b: 3 }],
      'Digit8': [{ r: 4, b: 2 }], 'Numpad8': [{ r: 4, b: 2 }], '8': [{ r: 4, b: 2 }],
      'Digit9': [{ r: 4, b: 1 }], 'Numpad9': [{ r: 4, b: 1 }], '9': [{ r: 4, b: 1 }],
      'Digit0': [{ r: 4, b: 0 }], 'Numpad0': [{ r: 4, b: 0 }], '0': [{ r: 4, b: 0 }],

      // Top row
      'KeyQ': [{ r: 1, b: 0 }], 'q': [{ r: 1, b: 0 }], 'Q': [{ r: 1, b: 0 }],
      'KeyW': [{ r: 1, b: 1 }], 'w': [{ r: 1, b: 1 }], 'W': [{ r: 1, b: 1 }],
      'KeyE': [{ r: 1, b: 2 }], 'e': [{ r: 1, b: 2 }], 'E': [{ r: 1, b: 2 }],
      'KeyR': [{ r: 1, b: 3 }], 'r': [{ r: 1, b: 3 }], 'R': [{ r: 1, b: 3 }],
      'KeyT': [{ r: 1, b: 4 }], 't': [{ r: 1, b: 4 }], 'T': [{ r: 1, b: 4 }],
      'KeyY': [{ r: 5, b: 4 }], 'y': [{ r: 5, b: 4 }], 'Y': [{ r: 5, b: 4 }],
      'KeyU': [{ r: 5, b: 3 }], 'u': [{ r: 5, b: 3 }], 'U': [{ r: 5, b: 3 }],
      'KeyI': [{ r: 5, b: 2 }], 'i': [{ r: 5, b: 2 }], 'I': [{ r: 5, b: 2 }],
      'KeyO': [{ r: 5, b: 1 }], 'o': [{ r: 5, b: 1 }], 'O': [{ r: 5, b: 1 }],
      'KeyP': [{ r: 5, b: 0 }], 'p': [{ r: 5, b: 0 }], 'P': [{ r: 5, b: 0 }],

      // Middle row
      'KeyA': [{ r: 2, b: 0 }], 'a': [{ r: 2, b: 0 }], 'A': [{ r: 2, b: 0 }],
      'KeyS': [{ r: 2, b: 1 }], 's': [{ r: 2, b: 1 }], 'S': [{ r: 2, b: 1 }],
      'KeyD': [{ r: 2, b: 2 }], 'd': [{ r: 2, b: 2 }], 'D': [{ r: 2, b: 2 }],
      'KeyF': [{ r: 2, b: 3 }], 'f': [{ r: 2, b: 3 }], 'F': [{ r: 2, b: 3 }],
      'KeyG': [{ r: 2, b: 4 }], 'g': [{ r: 2, b: 4 }], 'G': [{ r: 2, b: 4 }],
      'KeyH': [{ r: 6, b: 4 }], 'h': [{ r: 6, b: 4 }], 'H': [{ r: 6, b: 4 }],
      'KeyJ': [{ r: 6, b: 3 }], 'j': [{ r: 6, b: 3 }], 'J': [{ r: 6, b: 3 }],
      'KeyK': [{ r: 6, b: 2 }], 'k': [{ r: 6, b: 2 }], 'K': [{ r: 6, b: 2 }],
      'KeyL': [{ r: 6, b: 1 }], 'l': [{ r: 6, b: 1 }], 'L': [{ r: 6, b: 1 }],
      'Enter': [{ r: 6, b: 0 }], 'NumpadEnter': [{ r: 6, b: 0 }],

      // Bottom row
      'ShiftLeft': [{ r: 3, b: 0 }], // Caps Shift
      'KeyZ': [{ r: 3, b: 1 }], 'z': [{ r: 3, b: 1 }], 'Z': [{ r: 3, b: 1 }],
      'KeyX': [{ r: 3, b: 2 }], 'x': [{ r: 3, b: 2 }], 'X': [{ r: 3, b: 2 }],
      'KeyC': [{ r: 3, b: 3 }], 'c': [{ r: 3, b: 3 }], 'C': [{ r: 3, b: 3 }],
      'KeyV': [{ r: 3, b: 4 }], 'v': [{ r: 3, b: 4 }], 'V': [{ r: 3, b: 4 }],
      'KeyB': [{ r: 7, b: 4 }], 'b': [{ r: 7, b: 4 }], 'B': [{ r: 7, b: 4 }],
      'KeyN': [{ r: 7, b: 3 }], 'n': [{ r: 7, b: 3 }], 'N': [{ r: 7, b: 3 }],
      'KeyM': [{ r: 7, b: 2 }], 'm': [{ r: 7, b: 2 }], 'M': [{ r: 7, b: 2 }],
      'ControlLeft': [{ r: 7, b: 1 }], // Symbol Shift
      'ControlRight': [{ r: 7, b: 1 }],
      'AltLeft': [{ r: 7, b: 1 }],
      'AltRight': [{ r: 7, b: 1 }],
      'ShiftRight': [{ r: 7, b: 1 }], // Map Right Shift to Symbol Shift for easier typing
      'Space': [{ r: 7, b: 0 }], ' ': [{ r: 7, b: 0 }],

      // Smart helper keys
      'Backspace': [{ r: 3, b: 0 }, { r: 4, b: 0 }], // Caps Shift + 0 = Delete
      'ArrowLeft': [{ r: 3, b: 0 }, { r: 0, b: 4 }],  // Caps Shift + 5 = Cursor Left
      'ArrowDown': [{ r: 3, b: 0 }, { r: 4, b: 4 }],  // Caps Shift + 6 = Cursor Down
      'ArrowUp': [{ r: 3, b: 0 }, { r: 4, b: 3 }],    // Caps Shift + 7 = Cursor Up
      'ArrowRight': [{ r: 3, b: 0 }, { r: 4, b: 2 }], // Caps Shift + 8 = Cursor Right

      // Symbol keys
      'Quote': [{ r: 7, b: 1 }, { r: 5, b: 0 }],      // Symbol + P = "
      'Semicolon': [{ r: 7, b: 1 }, { r: 5, b: 1 }],  // Symbol + O = ;
      'Equal': [{ r: 7, b: 1 }, { r: 6, b: 1 }],      // Symbol + L = =
      'Minus': [{ r: 7, b: 1 }, { r: 6, b: 3 }],      // Symbol + J = -
      'Period': [{ r: 7, b: 1 }, { r: 7, b: 2 }],     // Symbol + M = .
      'Comma': [{ r: 7, b: 1 }, { r: 7, b: 3 }],      // Symbol + N = ,
      'Slash': [{ r: 7, b: 1 }, { r: 3, b: 4 }],      // Symbol + V = /
    };

    // Active pressed keys tracking for simultaneous physical key releases
    this.pressedKeys = new Map();
  }

  reset() {
    for (let i = 0; i < 8; i++) {
      this.matrix[i] = 0x1f; // All 5 keys unpressed (bits 0..4 = 1)
    }
    this.pressedKeys.clear();
    this.joystickKeys.clear();
    this.manualKempston = 0;
    this.kempston = 0;
  }

  /**
   * Reads the keyboard state for a given port address (e.g. 0xFEFE, 0xFDFE, etc.)
   * @param {number} port - 16-bit port address
   * @returns {number} - 8-bit port FE data (bits 0..4 = key lines, 0 = pressed)
   */
  readPortFE(port) {
    const high = (port >> 8) & 0xff;
    let res = 0x1f;

    // Bit 0 corresponds to A8 (0xFE -> row 3)
    if (!(high & 0x01)) res &= this.matrix[3]; // A8: Caps, Z, X, C, V
    if (!(high & 0x02)) res &= this.matrix[2]; // A9: A, S, D, F, G
    if (!(high & 0x04)) res &= this.matrix[1]; // A10: Q, W, E, R, T
    if (!(high & 0x08)) res &= this.matrix[0]; // A11: 1, 2, 3, 4, 5
    if (!(high & 0x10)) res &= this.matrix[4]; // A12: 0, 9, 8, 7, 6
    if (!(high & 0x20)) res &= this.matrix[5]; // A13: P, O, I, U, Y
    if (!(high & 0x40)) res &= this.matrix[6]; // A14: Enter, L, K, J, H
    if (!(high & 0x80)) res &= this.matrix[7]; // A15: Space, Symbol, M, N, B

    return res;
  }

  readKempston() {
    return this.kempston;
  }

  keyDown(code, key = '') {
    // Also update Kempston joystick state without blocking keyboard matrix
    this.handleJoystickKey(code, true);

    const mapping = this.keyMap[code] || (key ? this.keyMap[key] : null);
    if (mapping) {
      this.pressedKeys.set(code, mapping);
      for (const m of mapping) {
        this.matrix[m.r] &= ~(1 << m.b); // Set bit to 0 (pressed)
      }
    }
  }

  keyUp(code, key = '') {
    this.handleJoystickKey(code, false);

    const mapping = this.pressedKeys.get(code) || this.keyMap[code] || (key ? this.keyMap[key] : null);
    if (mapping) {
      this.pressedKeys.delete(code);
      // Rebuild matrix from remaining active pressed keys
      this.rebuildMatrix();
    }
  }

  pressSpectrumKey(row, bit) {
    this.matrix[row] &= ~(1 << bit);
  }

  releaseSpectrumKey(row, bit) {
    this.matrix[row] |= (1 << bit);
  }

  rebuildMatrix() {
    // Reset all to 1
    for (let i = 0; i < 8; i++) {
      this.matrix[i] = 0x1f;
    }
    // Apply all currently pressed keys
    for (const mapping of this.pressedKeys.values()) {
      for (const m of mapping) {
        this.matrix[m.r] &= ~(1 << m.b);
      }
    }
    // Sinclair/Cursor joystick directions share the keyboard matrix. Keep
    // every still-held direction active when another direction is released.
    for (const target of this.joystickKeys.values()) {
      if (target.type === 'matrix') {
        this.matrix[target.r] &= ~(1 << target.b);
      }
    }
  }

  handleJoystickKey(code, isDown) {
    let target = null;

    // 1. Kempston Joystick (Port 0x1F)
    if (this.joystickMode === 'kempston') {
      let bit = -1;
      if (code === 'ArrowRight' || code === 'Numpad6') bit = 0; // Right (bit 0 = 1)
      else if (code === 'ArrowLeft' || code === 'Numpad4') bit = 1; // Left (bit 1 = 2)
      else if (code === 'ArrowDown' || code === 'Numpad2') bit = 2; // Down (bit 2 = 4)
      else if (code === 'ArrowUp' || code === 'Numpad8') bit = 3;   // Up (bit 3 = 8)
      else if (code === 'Space' || code === 'KeyZ' || code === 'KeyX' || code === 'ControlRight' || code === 'Numpad0' || code === 'Enter') {
        bit = 4; // Fire (bit 4 = 16)
      }

      if (bit !== -1) {
        target = { type: 'kempston', bit };
      }
    }

    // 2. Sinclair Interface 2 - Joystick 1 (Keys 6, 7, 8, 9, 0)
    else if (this.joystickMode === 'sinclair1') {
      if (code === 'ArrowLeft') target = { r: 4, b: 4 };      // '6'
      else if (code === 'ArrowRight') target = { r: 4, b: 3 }; // '7'
      else if (code === 'ArrowDown') target = { r: 4, b: 2 };  // '8'
      else if (code === 'ArrowUp') target = { r: 4, b: 1 };    // '9'
      else if (code === 'Space' || code === 'KeyZ' || code === 'KeyX') target = { r: 4, b: 0 }; // '0' (Fire)
      if (target) target.type = 'matrix';
    }

    // 3. Sinclair Interface 2 - Joystick 2 (Keys 1, 2, 3, 4, 5)
    else if (this.joystickMode === 'sinclair2') {
      if (code === 'ArrowLeft') target = { r: 0, b: 0 };      // '1'
      else if (code === 'ArrowRight') target = { r: 0, b: 1 }; // '2'
      else if (code === 'ArrowDown') target = { r: 0, b: 2 };  // '3'
      else if (code === 'ArrowUp') target = { r: 0, b: 3 };    // '4'
      else if (code === 'Space' || code === 'KeyZ' || code === 'KeyX') target = { r: 0, b: 4 }; // '5' (Fire)
      if (target) target.type = 'matrix';
    }

    // 4. Cursor / Protek Joystick (Keys 5, 6, 7, 8, 0)
    else if (this.joystickMode === 'cursor') {
      if (code === 'ArrowLeft') target = { r: 0, b: 4 };      // '5'
      else if (code === 'ArrowDown') target = { r: 4, b: 4 };  // '6'
      else if (code === 'ArrowUp') target = { r: 4, b: 3 };    // '7'
      else if (code === 'ArrowRight') target = { r: 4, b: 2 }; // '8'
      else if (code === 'Space' || code === 'KeyZ' || code === 'KeyX') target = { r: 4, b: 0 }; // '0' (Fire)
      if (target) target.type = 'matrix';
    }

    if (isDown && target) this.joystickKeys.set(code, target);
    else if (!isDown) this.joystickKeys.delete(code);

    // Recompute rather than toggling a bit directly: two physical keys can
    // map to the same Kempston action and releasing one must not release both.
    this.kempston = this.manualKempston;
    for (const active of this.joystickKeys.values()) {
      if (active.type === 'kempston') this.kempston |= (1 << active.bit);
    }
    this.rebuildMatrix();

    return false; // Allow hybrid matrix routing
  }

  setKempstonBit(bit, pressed) {
    if (pressed) {
      this.manualKempston |= (1 << bit);
    } else {
      this.manualKempston &= ~(1 << bit);
    }
    this.kempston = this.manualKempston;
    for (const active of this.joystickKeys.values()) {
      if (active.type === 'kempston') this.kempston |= (1 << active.bit);
    }
  }
}
