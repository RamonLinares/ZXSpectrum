/**
 * Terra Cresta - Keyboard, Touch D-Pad, and Gamepad Controller
 */

export class InputHandler {
  constructor() {
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;
    this.fire = false;
    this.secondaryFire = false;
    this.secondaryFirePressed = false;
    this.start = false;

    this.keys = {};
    this.initKeyboard();
    this.initTouchControls();
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.keys[e.key] = true;

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }

      this.updateState();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key] = false;
      this.updateState();
    });
  }

  updateState() {
    this.left = !!(this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyO'] || this.keys['Numpad4']);
    this.right = !!(this.keys['ArrowRight'] || this.keys['KeyD'] || this.keys['KeyP'] || this.keys['Numpad6']);
    this.up = !!(this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['KeyQ'] || this.keys['Numpad8']);
    this.down = !!(this.keys['ArrowDown'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['Numpad2']);

    this.fire = !!(this.keys['Space'] || this.keys['KeyZ'] || this.keys['KeyJ'] || this.keys['Numpad0']);

    const sec = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyX'] || this.keys['KeyK']);
    if (sec && !this.secondaryFire) {
      this.secondaryFirePressed = true;
    }
    this.secondaryFire = sec;

    this.start = !!(this.keys['Digit1'] || this.keys['Enter'] || this.keys['Space']);
  }

  initTouchControls() {
    const bindBtn = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;

      const down = (e) => {
        e.preventDefault();
        this.keys[key] = true;
        this.updateState();
      };
      const up = (e) => {
        e.preventDefault();
        this.keys[key] = false;
        this.updateState();
      };

      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
    };

    bindBtn('tc-dpad-left', 'ArrowLeft');
    bindBtn('tc-dpad-right', 'ArrowRight');
    bindBtn('tc-dpad-up', 'ArrowUp');
    bindBtn('tc-dpad-down', 'ArrowDown');
    bindBtn('tc-btn-fire', 'Space');
    bindBtn('tc-btn-split', 'ShiftLeft');
  }

  // Clear single-frame action triggers
  postUpdate() {
    this.secondaryFirePressed = false;
  }
}
