/**
 * Sinclair ZX Spectrum 48K ROM Loader & Fallback Stub
 * 
 * Note: The official Sinclair ZX Spectrum 48K ROM binary (16,384 bytes)
 * is not bundled in this repository in compliance with copyright guidelines.
 * 
 * Place your '48k.rom' in the root directory or drag-and-drop it into the emulator.
 */

// Minimal boot stub used when 48k.rom is not yet loaded
export function createMinimalBootROM() {
  const rom = new Uint8Array(16384);
  // Default unprogrammed ROM bytes
  rom.fill(0xff);

  // Simple Z80 boot loop:
  // 0000: F3          DI
  // 0001: AF          XOR A
  // 0002: D3 FE       OUT (0xFE), A
  // 0004: 31 00 60    LD SP, 0x6000
  // 0007: C3 07 00    JP 0x0007 (Spin until full ROM is loaded)
  rom[0x0000] = 0xf3; // DI
  rom[0x0001] = 0xaf; // XOR A
  rom[0x0002] = 0xd3; // OUT (0xFE), A
  rom[0x0003] = 0xfe;
  rom[0x0004] = 0x31; // LD SP, 0x6000
  rom[0x0005] = 0x00;
  rom[0x0006] = 0x60;
  rom[0x0007] = 0xc3; // JP 0x0007
  rom[0x0008] = 0x07;
  rom[0x0009] = 0x00;

  return rom;
}

/**
 * Attempts to asynchronously load '48k.rom' via fetch (browser) or fs (Node.js)
 */
export async function loadSpectrumROM() {
  if (typeof window !== 'undefined' && window.fetch) {
    try {
      const resp = await fetch('48k.rom');
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength === 16384) {
          return new Uint8Array(buf);
        }
      }
    } catch (e) {
      console.warn('48k.rom not found in root directory. Drag and drop 48k.rom to initialize.', e);
    }
  } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const romPath = path.resolve('48k.rom');
      if (fs.existsSync(romPath)) {
        const buf = fs.readFileSync(romPath);
        if (buf.length === 16384) {
          return new Uint8Array(buf);
        }
      }
    } catch (e) {
      // Node fallback
    }
  }

  return createMinimalBootROM();
}
