/**
 * Automated Verification Test Suite for ZX Spectrum 48K Emulator
 */

import { Z80 } from '../src/z80.js';
import { ZXSpectrum, SPECTRUM_PALETTE } from '../src/spectrum.js';
import { loadSpectrumROM } from '../src/rom.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('=== Running ZX Spectrum 48K Verification Tests ===\n');

// 1. Test ROM Integrity
console.log('1. Testing Sinclair 48K ROM:');
const rom = await loadSpectrumROM();
assert(rom.length === 16384, `ROM size is exactly 16,384 bytes (got ${rom.length})`);
assert(rom[0] === 0xf3, `ROM start opcode is DI (0xF3) (got 0x${rom[0].toString(16)})`);
assert(rom[1] === 0xaf, `ROM second opcode is XOR A (0xAF) (got 0x${rom[1].toString(16)})`);

// 2. Test Z80 Arithmetic & Logic
console.log('\n2. Testing Z80 CPU Operations:');
const mockMem = {
  data: new Uint8Array(65536),
  readByte(addr) { return this.data[addr & 0xffff]; },
  writeByte(addr, val) { this.data[addr & 0xffff] = val & 0xff; },
  readPort() { return 0xff; },
  writePort() {}
};

const cpu = new Z80(mockMem);
cpu.reset();

// Test ADD A, B
cpu.a = 0x15;
cpu.b = 0x27;
cpu.add8(cpu.b);
assert(cpu.a === 0x3c, `ADD A, B: 0x15 + 0x27 = 0x3C (got 0x${cpu.a.toString(16)})`);

// Test SUB B
cpu.a = 0x50;
cpu.b = 0x20;
cpu.sub8(cpu.b);
assert(cpu.a === 0x30, `SUB B: 0x50 - 0x20 = 0x30 (got 0x${cpu.a.toString(16)})`);
assert((cpu.f & 0x02) !== 0, 'N flag set on SUB');

// Test DAA (Decimal Adjust Accumulator)
cpu.reset();
cpu.a = 0x15;
cpu.add8(0x27);
cpu.daa();
assert(cpu.a === 0x42, `BCD Addition 15 + 27 = 42 via DAA (got 0x${cpu.a.toString(16)})`);

// Test 16-bit registers and stack
cpu.reset();
cpu.hl = 0x1234;
assert(cpu.h === 0x12 && cpu.l === 0x34, `HL 16-bit register packing: H=0x12, L=0x34`);
cpu.pushWord(0xABCD);
const popped = cpu.popWord();
assert(popped === 0xABCD, `Stack pushWord/popWord: pushed 0xABCD, popped 0x${popped.toString(16).toUpperCase()}`);

// 3. Test Spectrum Hardware & Memory Protection
console.log('\n3. Testing Spectrum 48K Hardware & Memory:');
const spectrum = new ZXSpectrum();
assert(spectrum.memory.length === 65536, 'Spectrum address space is 64KB');

// Check ROM is read-only
spectrum.writeByte(0x0000, 0x42);
assert(spectrum.readByte(0x0000) === 0xf3, 'ROM is protected from writes (address 0x0000 still 0xF3)');

// Check RAM is read/write
spectrum.writeByte(0x4000, 0x55);
assert(spectrum.readByte(0x4000) === 0x55, 'RAM 0x4000 is writable (got 0x55)');

// 4. Test Port 0xFE & Keyboard Matrix
console.log('\n4. Testing Port 0xFE Keyboard & Border:');
spectrum.writePort(0x00fe, 0x02); // Set border red
assert(spectrum.borderColor === 2, `Border color set to 2 (Red) (got ${spectrum.borderColor})`);

// Matrix key press
assert((spectrum.readPort(0xfefe) & 0x01) === 0x01, 'Caps Shift initially unpressed (bit 0 high)');
spectrum.keyboard.pressSpectrumKey(3, 0); // Caps Shift is row 3, bit 0
assert((spectrum.readPort(0xfefe) & 0x01) === 0x00, 'Caps Shift active (bit 0 low on port 0xFEFE)');
spectrum.keyboard.releaseSpectrumKey(3, 0);
assert((spectrum.readPort(0xfefe) & 0x01) === 0x01, 'Caps Shift released');

// 5. Test Snapshot Serialization (.SNA)
console.log('\n5. Testing .SNA Snapshot Save & Load:');
spectrum.reset();
spectrum.cpu.a = 0x42;
spectrum.cpu.bc = 0x1337;
spectrum.cpu.pc = 0x8000;
spectrum.memory[0x8000] = 0x3E; // LD A, n
spectrum.memory[0x8001] = 0x99;

const snaData = spectrum.saveSNA();
assert(snaData.length === 49179, `SNA length is standard 49,179 bytes (got ${snaData.length})`);

// Load back into a fresh instance
const newSpectrum = new ZXSpectrum();
newSpectrum.loadSNA(snaData);
assert(newSpectrum.cpu.a === 0x42, `Restored CPU A register: 0x42 (got 0x${newSpectrum.cpu.a.toString(16)})`);
assert(newSpectrum.cpu.bc === 0x1337, `Restored CPU BC register: 0x1337 (got 0x${newSpectrum.cpu.bc.toString(16)})`);
assert(newSpectrum.readByte(0x8000) === 0x3e, `Restored RAM 0x8000 = 0x3E`);
assert(newSpectrum.readByte(0x8001) === 0x99, `Restored RAM 0x8001 = 0x99`);

// 6. Test Video Scanline and Palette Mapping
console.log('\n6. Testing Video Rendering:');
assert(SPECTRUM_PALETTE.length === 16, 'Palette contains 16 colors (8 normal + 8 bright)');
spectrum.runFrame();
assert(spectrum.screenBuffer.length === 320 * 240, 'Rendered frame buffer matches 320x240 display');
assert(spectrum.totalFramesRendered === 1, 'Total frames rendered incremented to 1');

// 7. Test TAP Tape Parser and Auto-Load Hook
console.log('\n7. Testing TAP Tape Parsing and ROM Hook:');
// Create synthetic multi-block TAP file (Header block + Data block)
// Block 1: 19 bytes = flag 0x00 + 17 header bytes + checksum 0x00
// Block 2: 10 bytes = flag 0xFF + 8 payload bytes + checksum
const tapSynthetic = new Uint8Array([
  // Block 1: Header (len = 19 bytes)
  19, 0,
  0x00, // flag: header
  0x03, // type: bytes
  0x54, 0x45, 0x53, 0x54, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, // Name: "TEST      "
  0x08, 0x00, // length: 8 bytes
  0x00, 0x80, // start address: 0x8000
  0x00, 0x00, // unused
  0x00, // checksum

  // Block 2: Data (len = 10 bytes: 1 flag + 8 data bytes + 1 checksum)
  10, 0,
  0xff, // flag: data
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, // payload
  0x00 // checksum
]);

const tapSpectrum = new ZXSpectrum();
const parsedBlocks = tapSpectrum.parseTAP(tapSynthetic);
assert(parsedBlocks.length === 2, `Parsed 2 TAP blocks (got ${parsedBlocks.length})`);
assert(parsedBlocks[0].flag === 0x00 && parsedBlocks[0].name === 'TEST', `Block 1 is Header 'TEST'`);
assert(parsedBlocks[1].flag === 0xff && parsedBlocks[1].size === 10, `Block 2 is Data (10 bytes)`);

// Test ROM LD_BYTES hook at 0x0556
tapSpectrum.tapeBlocks = parsedBlocks;
tapSpectrum.tapeBlockIndex = 0;
tapSpectrum.cpu.sp = 0xff00;
tapSpectrum.cpu.pushWord(0x1234); // return address
tapSpectrum.cpu.pc = 0x0556;
tapSpectrum.cpu.ix = 0x8000;
tapSpectrum.cpu.de = 17;
tapSpectrum.cpu.a_ = 0x00; // Expected header flag

tapSpectrum.handleTapeTrap(false);
assert((tapSpectrum.cpu.f & 0x01) === 0x01, 'Carry flag set (Header loaded successfully)');
assert(tapSpectrum.cpu.pc === 0x1234, 'PC returned to caller address (0x1234)');
assert(tapSpectrum.tapeBlockIndex === 1, 'Tape advanced to block index 1');

// Test loading the second (Data) block into RAM at 0x8000
tapSpectrum.cpu.sp = 0xff00;
tapSpectrum.cpu.pushWord(0x5678);
tapSpectrum.cpu.pc = 0x0556;
tapSpectrum.cpu.ix = 0x8000;
tapSpectrum.cpu.de = 8;
tapSpectrum.cpu.a_ = 0xff; // Expected data flag

tapSpectrum.handleTapeTrap(false);
assert((tapSpectrum.cpu.f & 0x01) === 0x01, 'Carry flag set (Data block loaded successfully)');
assert(tapSpectrum.readByte(0x8000) === 0x11, 'RAM 0x8000 contains first payload byte (0x11)');
assert(tapSpectrum.readByte(0x8007) === 0x88, 'RAM 0x8007 contains last payload byte (0x88)');
assert(tapSpectrum.tapeBlockIndex === 2, 'Tape advanced to block index 2');

// 8. Test Kempston Joystick (Port 0x1F) & Fire Mapping
console.log('\n8. Testing Kempston & Joystick Modes:');
const joySpec = new ZXSpectrum();
joySpec.keyboard.joystickMode = 'kempston';

// Test Space / Fire bit 4 (value 16)
joySpec.keyboard.keyDown('Space', ' ');
assert(joySpec.keyboard.readKempston() === 16, `Kempston Fire (Space) sets bit 4 / value 16 (got ${joySpec.keyboard.readKempston()})`);
assert((joySpec.readPort(0x001f) & 0x10) === 0x10, 'Port 0x1F returns bit 4 high on Fire');
// Verify hybrid matrix mapping: Space also sets Row 7 Bit 0 (0x1E)
assert((joySpec.keyboard.readPortFE(0x7ffe) & 0x01) === 0x00, 'Hybrid mapping: Space also pulls Row 7 Bit 0 low');
joySpec.keyboard.keyUp('Space', ' ');
assert(joySpec.keyboard.readKempston() === 0, 'Kempston resets to 0 on Space release');
assert((joySpec.keyboard.readPortFE(0x7ffe) & 0x01) === 0x01, 'Row 7 Bit 0 released');

// Test Kempston Directions (Right=1, Left=2, Down=4, Up=8)
joySpec.keyboard.keyDown('ArrowRight');
assert(joySpec.keyboard.readKempston() === 1, 'Kempston Right = 1');
joySpec.keyboard.keyDown('Numpad6');
joySpec.keyboard.keyUp('ArrowRight');
assert(joySpec.keyboard.readKempston() === 1, 'Kempston Right remains held through its Numpad6 alias');
joySpec.keyboard.keyUp('Numpad6');
joySpec.keyboard.keyDown('ArrowRight');
joySpec.keyboard.keyDown('Space');
assert(joySpec.keyboard.readKempston() === 17, 'Kempston Right + Fire = 1 + 16 = 17');
joySpec.keyboard.keyUp('ArrowRight');
joySpec.keyboard.keyUp('Space');

joySpec.keyboard.keyDown('ArrowLeft');
assert(joySpec.keyboard.readKempston() === 2, 'Kempston Left = 2');
joySpec.keyboard.keyUp('ArrowLeft');

joySpec.keyboard.keyDown('ArrowDown');
assert(joySpec.keyboard.readKempston() === 4, 'Kempston Down = 4');
joySpec.keyboard.keyUp('ArrowDown');

joySpec.keyboard.keyDown('ArrowUp');
assert(joySpec.keyboard.readKempston() === 8, 'Kempston Up = 8');
joySpec.keyboard.keyUp('ArrowUp');

// 9. Test Sinclair & Cursor Joystick Modes
joySpec.keyboard.joystickMode = 'sinclair1'; // 6=Left, 7=Right, 8=Down, 9=Up, 0=Fire
joySpec.keyboard.keyDown('ArrowLeft');
assert((joySpec.keyboard.readPortFE(0xeffe) & 0x10) === 0x00, 'Sinclair 1: ArrowLeft triggers key 6 (Row 4, Bit 4)');
joySpec.keyboard.keyDown('ArrowUp');
joySpec.keyboard.keyUp('ArrowLeft');
assert((joySpec.keyboard.readPortFE(0xeffe) & 0x02) === 0x00, 'Sinclair 1: held Up survives releasing Left');
joySpec.keyboard.keyUp('ArrowUp');

joySpec.keyboard.joystickMode = 'cursor'; // 5=Left, 6=Down, 7=Up, 8=Right, 0=Fire
joySpec.keyboard.keyDown('ArrowLeft');
assert((joySpec.keyboard.readPortFE(0xf7fe) & 0x10) === 0x00, 'Cursor mode: ArrowLeft triggers key 5 (Row 0, Bit 4)');
joySpec.keyboard.keyUp('ArrowLeft');

// 10. Test Save-State Non-Mutation & Full Matrix Rebuild
console.log('\n10. Testing Save-State Non-Mutation & Matrix Cleanliness:');
const cleanSpec = new ZXSpectrum();
cleanSpec.keyboard.keyDown('Digit1', '1');
cleanSpec.keyboard.keyDown('KeyA', 'a');
const savedSNA = cleanSpec.saveSNA();
cleanSpec.keyboard.keyUp('Digit1', '1');
cleanSpec.keyboard.keyUp('KeyA', 'a');

// Load into new instance and ensure no residual keys or mutation
const loadedSpec = new ZXSpectrum();
loadedSpec.loadSNA(savedSNA);
assert(loadedSpec.keyboard.pressedKeys.size === 0, 'Loaded state has clean pressedKeys map (size 0)');
for (let r = 0; r < 8; r++) {
  assert(loadedSpec.keyboard.matrix[r] === 0x1f, `Loaded state matrix row ${r} is clean 0x1F`);
}

// 11. Test 48K ULA Floating Bus and Terra Cresta's wait loop
console.log('\n11. Testing 48K ULA Floating Bus:');
const busSpec = new ZXSpectrum();
busSpec.memory[0x4000] = 0x12;
busSpec.memory[0x5800] = 0x34;
busSpec.memory[0x4001] = 0x56;
busSpec.memory[0x4100] = 0x78;

busSpec.cpu.tstates = 14337;
assert(busSpec.readPort(0x28ff, 10) === 0x12, 'First display fetch returns bitmap byte at 0x4000');
busSpec.cpu.tstates = 14338;
assert(busSpec.readPort(0x28ff, 10) === 0x34, 'Second display fetch returns attribute byte at 0x5800');
busSpec.cpu.tstates = 14339;
assert(busSpec.readPort(0x28ff, 10) === 0x56, 'Third display fetch returns next bitmap byte at 0x4001');
busSpec.cpu.tstates = 14341;
assert(busSpec.readPort(0x28ff, 10) === 0xff, 'Floating bus is 0xFF during the idle half of an 8T fetch group');
busSpec.cpu.tstates = 14561;
assert(busSpec.readPort(0x28ff, 10) === 0x78, 'Next scanline fetch uses Spectrum bitmap layout at 0x4100');

const terraLoopSpec = new ZXSpectrum();
terraLoopSpec.memory.set([
  0x3e, 0x28, // LD A,0x28
  0xdb, 0xff, // IN A,(0xFF)
  0xfe, 0x3f, // CP 0x3F
  0x30, 0xf8  // JR NC back to LD A,0x28
], 0x9000);
terraLoopSpec.cpu.pc = 0x9000;
terraLoopSpec.cpu.tstates = 14300;
for (let i = 0; i < 20 && terraLoopSpec.cpu.pc !== 0x9008; i++) {
  terraLoopSpec.cpu.step();
}
assert(terraLoopSpec.cpu.pc === 0x9008, 'Terra Cresta-style IN A,(0xFF) wait loop advances on an active ULA fetch');

// Results summary
console.log('\n=========================================');
console.log(`Verification Summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✨');
}
