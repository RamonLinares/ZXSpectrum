/**
 * Z80 CPU Live Debugger, Disassembler & Memory Inspector
 */

export class SpectrumDebugger {
  constructor(spectrum) {
    this.spectrum = spectrum;
    this.breakpoints = new Set();
    this.disassemblyLines = 16;
  }

  /**
   * Get CPU state object formatted for display
   */
  getState() {
    const cpu = this.spectrum.cpu;
    const f = cpu.f;

    return {
      pc: cpu.pc.toString(16).padStart(4, '0').toUpperCase(),
      sp: cpu.sp.toString(16).padStart(4, '0').toUpperCase(),
      af: cpu.af.toString(16).padStart(4, '0').toUpperCase(),
      bc: cpu.bc.toString(16).padStart(4, '0').toUpperCase(),
      de: cpu.de.toString(16).padStart(4, '0').toUpperCase(),
      hl: cpu.hl.toString(16).padStart(4, '0').toUpperCase(),
      ix: cpu.ix.toString(16).padStart(4, '0').toUpperCase(),
      iy: cpu.iy.toString(16).padStart(4, '0').toUpperCase(),
      af_: cpu.af_.toString(16).padStart(4, '0').toUpperCase(),
      bc_: cpu.bc_.toString(16).padStart(4, '0').toUpperCase(),
      de_: cpu.de_.toString(16).padStart(4, '0').toUpperCase(),
      hl_: cpu.hl_.toString(16).padStart(4, '0').toUpperCase(),
      i: cpu.i.toString(16).padStart(2, '0').toUpperCase(),
      r: cpu.rReg.toString(16).padStart(2, '0').toUpperCase(),
      im: cpu.im,
      iff1: cpu.iff1 ? 1 : 0,
      iff2: cpu.iff2 ? 1 : 0,
      flags: {
        s: (f & 0x80) ? 1 : 0,
        z: (f & 0x40) ? 1 : 0,
        y: (f & 0x20) ? 1 : 0,
        h: (f & 0x10) ? 1 : 0,
        x: (f & 0x08) ? 1 : 0,
        pv: (f & 0x04) ? 1 : 0,
        n: (f & 0x02) ? 1 : 0,
        c: (f & 0x01) ? 1 : 0
      },
      tstates: cpu.tstates,
      border: this.spectrum.borderColor
    };
  }

  /**
   * Disassemble instructions starting from address
   */
  disassemble(startAddr, count = 16) {
    const lines = [];
    let addr = startAddr & 0xffff;

    for (let i = 0; i < count; i++) {
      const lineAddr = addr;
      const op = this.spectrum.readByte(addr);
      let mnemonic = 'NOP';
      let len = 1;

      // Basic opcode disassembly decoder
      if (op === 0x00) { mnemonic = 'NOP'; len = 1; }
      else if (op === 0x01) { mnemonic = `LD BC, #${this.getWord(addr + 1)}`; len = 3; }
      else if (op === 0x02) { mnemonic = 'LD (BC), A'; len = 1; }
      else if (op === 0x03) { mnemonic = 'INC BC'; len = 1; }
      else if (op === 0x04) { mnemonic = 'INC B'; len = 1; }
      else if (op === 0x05) { mnemonic = 'DEC B'; len = 1; }
      else if (op === 0x06) { mnemonic = `LD B, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x07) { mnemonic = 'RLCA'; len = 1; }
      else if (op === 0x08) { mnemonic = "EX AF, AF'"; len = 1; }
      else if (op === 0x09) { mnemonic = 'ADD HL, BC'; len = 1; }
      else if (op === 0x0A) { mnemonic = 'LD A, (BC)'; len = 1; }
      else if (op === 0x0B) { mnemonic = 'DEC BC'; len = 1; }
      else if (op === 0x0C) { mnemonic = 'INC C'; len = 1; }
      else if (op === 0x0D) { mnemonic = 'DEC C'; len = 1; }
      else if (op === 0x0E) { mnemonic = `LD C, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x0F) { mnemonic = 'RRCA'; len = 1; }
      else if (op === 0x10) { mnemonic = `DJNZ #${this.getDisp(addr + 1)}`; len = 2; }
      else if (op === 0x11) { mnemonic = `LD DE, #${this.getWord(addr + 1)}`; len = 3; }
      else if (op === 0x12) { mnemonic = 'LD (DE), A'; len = 1; }
      else if (op === 0x13) { mnemonic = 'INC DE'; len = 1; }
      else if (op === 0x14) { mnemonic = 'INC D'; len = 1; }
      else if (op === 0x15) { mnemonic = 'DEC D'; len = 1; }
      else if (op === 0x16) { mnemonic = `LD D, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x17) { mnemonic = 'RLA'; len = 1; }
      else if (op === 0x18) { mnemonic = `JR #${this.getDisp(addr + 1)}`; len = 2; }
      else if (op === 0x19) { mnemonic = 'ADD HL, DE'; len = 1; }
      else if (op === 0x1A) { mnemonic = 'LD A, (DE)'; len = 1; }
      else if (op === 0x1B) { mnemonic = 'DEC DE'; len = 1; }
      else if (op === 0x1C) { mnemonic = 'INC E'; len = 1; }
      else if (op === 0x1D) { mnemonic = 'DEC E'; len = 1; }
      else if (op === 0x1E) { mnemonic = `LD E, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x1F) { mnemonic = 'RRA'; len = 1; }
      else if (op === 0x20) { mnemonic = `JR NZ, #${this.getDisp(addr + 1)}`; len = 2; }
      else if (op === 0x21) { mnemonic = `LD HL, #${this.getWord(addr + 1)}`; len = 3; }
      else if (op === 0x22) { mnemonic = `LD (${this.getWord(addr + 1)}), HL`; len = 3; }
      else if (op === 0x23) { mnemonic = 'INC HL'; len = 1; }
      else if (op === 0x24) { mnemonic = 'INC H'; len = 1; }
      else if (op === 0x25) { mnemonic = 'DEC H'; len = 1; }
      else if (op === 0x26) { mnemonic = `LD H, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x27) { mnemonic = 'DAA'; len = 1; }
      else if (op === 0x28) { mnemonic = `JR Z, #${this.getDisp(addr + 1)}`; len = 2; }
      else if (op === 0x29) { mnemonic = 'ADD HL, HL'; len = 1; }
      else if (op === 0x2A) { mnemonic = `LD HL, (${this.getWord(addr + 1)})`; len = 3; }
      else if (op === 0x2B) { mnemonic = 'DEC HL'; len = 1; }
      else if (op === 0x2C) { mnemonic = 'INC L'; len = 1; }
      else if (op === 0x2D) { mnemonic = 'DEC L'; len = 1; }
      else if (op === 0x2E) { mnemonic = `LD L, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x2F) { mnemonic = 'CPL'; len = 1; }
      else if (op === 0x30) { mnemonic = `JR NC, #${this.getDisp(addr + 1)}`; len = 2; }
      else if (op === 0x31) { mnemonic = `LD SP, #${this.getWord(addr + 1)}`; len = 3; }
      else if (op === 0x32) { mnemonic = `LD (${this.getWord(addr + 1)}), A`; len = 3; }
      else if (op === 0x33) { mnemonic = 'INC SP'; len = 1; }
      else if (op === 0x34) { mnemonic = 'INC (HL)'; len = 1; }
      else if (op === 0x35) { mnemonic = 'DEC (HL)'; len = 1; }
      else if (op === 0x36) { mnemonic = `LD (HL), #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x37) { mnemonic = 'SCF'; len = 1; }
      else if (op === 0x38) { mnemonic = `JR C, #${this.getDisp(addr + 1)}`; len = 2; }
      else if (op === 0x39) { mnemonic = 'ADD HL, SP'; len = 1; }
      else if (op === 0x3A) { mnemonic = `LD A, (${this.getWord(addr + 1)})`; len = 3; }
      else if (op === 0x3B) { mnemonic = 'DEC SP'; len = 1; }
      else if (op === 0x3C) { mnemonic = 'INC A'; len = 1; }
      else if (op === 0x3D) { mnemonic = 'DEC A'; len = 1; }
      else if (op === 0x3E) { mnemonic = `LD A, #${this.getByte(addr + 1)}`; len = 2; }
      else if (op === 0x3F) { mnemonic = 'CCF'; len = 1; }
      else if (op >= 0x40 && op <= 0x7F) {
        if (op === 0x76) mnemonic = 'HALT';
        else mnemonic = `LD ${this.getRegName((op >> 3) & 7)}, ${this.getRegName(op & 7)}`;
        len = 1;
      }
      else if (op >= 0x80 && op <= 0x87) { mnemonic = `ADD A, ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0x88 && op <= 0x8F) { mnemonic = `ADC A, ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0x90 && op <= 0x97) { mnemonic = `SUB ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0x98 && op <= 0x9F) { mnemonic = `SBC A, ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0xA0 && op <= 0xA7) { mnemonic = `AND ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0xA8 && op <= 0xAF) { mnemonic = `XOR ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0xB0 && op <= 0xB7) { mnemonic = `OR ${this.getRegName(op & 7)}`; len = 1; }
      else if (op >= 0xB8 && op <= 0xBF) { mnemonic = `CP ${this.getRegName(op & 7)}`; len = 1; }
      else if (op === 0xC3) { mnemonic = `JP #${this.getWord(addr + 1)}`; len = 3; }
      else if (op === 0xC9) { mnemonic = 'RET'; len = 1; }
      else if (op === 0xCD) { mnemonic = `CALL #${this.getWord(addr + 1)}`; len = 3; }
      else if (op === 0xCB) {
        const nextOp = this.spectrum.readByte(addr + 1);
        mnemonic = `CB ${nextOp.toString(16).padStart(2, '0').toUpperCase()}`;
        len = 2;
      }
      else if (op === 0xDD) {
        mnemonic = 'IX PREFIX';
        len = 2;
      }
      else if (op === 0xED) {
        const nextOp = this.spectrum.readByte(addr + 1);
        mnemonic = `ED ${nextOp.toString(16).padStart(2, '0').toUpperCase()}`;
        len = 2;
      }
      else if (op === 0xFD) {
        mnemonic = 'IY PREFIX';
        len = 2;
      }
      else {
        mnemonic = `DB #${op.toString(16).padStart(2, '0').toUpperCase()}`;
        len = 1;
      }

      // Read raw bytes
      const rawBytes = [];
      for (let b = 0; b < len; b++) {
        rawBytes.push(this.spectrum.readByte(addr + b).toString(16).padStart(2, '0').toUpperCase());
      }

      lines.push({
        addr: lineAddr.toString(16).padStart(4, '0').toUpperCase(),
        bytes: rawBytes.join(' '),
        mnemonic: mnemonic,
        isPC: lineAddr === this.spectrum.cpu.pc
      });

      addr = (addr + len) & 0xffff;
    }

    return lines;
  }

  getByte(addr) {
    return this.spectrum.readByte(addr).toString(16).padStart(2, '0').toUpperCase();
  }

  getWord(addr) {
    const l = this.spectrum.readByte(addr);
    const h = this.spectrum.readByte(addr + 1);
    return ((h << 8) | l).toString(16).padStart(4, '0').toUpperCase();
  }

  getDisp(addr) {
    let b = this.spectrum.readByte(addr);
    if (b & 0x80) b = b - 256;
    const target = (addr + 1 + b) & 0xffff;
    return target.toString(16).padStart(4, '0').toUpperCase();
  }

  getRegName(idx) {
    const names = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return names[idx & 7];
  }

  /**
   * Read Hex dump of memory
   */
  getHexDump(startAddr, bytesCount = 128) {
    const rows = [];
    let addr = startAddr & 0xfff0;

    for (let r = 0; r < bytesCount / 16; r++) {
      const rowAddr = (addr + r * 16) & 0xffff;
      const bytes = [];
      let ascii = '';

      for (let c = 0; c < 16; c++) {
        const b = this.spectrum.readByte((rowAddr + c) & 0xffff);
        bytes.push(b.toString(16).padStart(2, '0').toUpperCase());
        ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
      }

      rows.push({
        addr: rowAddr.toString(16).padStart(4, '0').toUpperCase(),
        bytes: bytes.join(' '),
        ascii: ascii
      });
    }

    return rows;
  }
}
