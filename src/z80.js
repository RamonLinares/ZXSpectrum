/**
 * Complete Zilog Z80 Microprocessor Emulation
 * Cycle-accurate T-state counting, complete instruction matrix:
 * Standard opcodes, CB prefix, ED prefix, DD/FD (IX/IY) prefixes, and DDCB/FDCB prefixes.
 */

export class Z80 {
  constructor(memory) {
    this.mem = memory; // object with readByte(addr), writeByte(addr, val), readPort(addr), writePort(addr, val)

    // Main 8-bit registers
    this.a = 0;
    this.f = 0;
    this.b = 0;
    this.c = 0;
    this.d = 0;
    this.e = 0;
    this.h = 0;
    this.l = 0;

    // Alternate registers
    this.a_ = 0;
    this.f_ = 0;
    this.b_ = 0;
    this.c_ = 0;
    this.d_ = 0;
    this.e_ = 0;
    this.h_ = 0;
    this.l_ = 0;

    // Index registers
    this.ix = 0;
    this.iy = 0;

    // Special registers
    this.sp = 0xffff;
    this.pc = 0x0000;
    this.i = 0;
    this.r = 0;
    this.r7 = 0; // bit 7 of R

    // Interrupt state
    this.iff1 = false;
    this.iff2 = false;
    this.im = 1; // Default Spectrum IM 1
    this.halted = false;
    this.eiPending = false;

    // T-states
    this.tstates = 0;

    // Precomputed tables for ultra-fast flag calculations
    this.initTables();
  }

  initTables() {
    this.SZ = new Uint8Array(256);
    this.SZ_BIT = new Uint8Array(256);
    this.SZP = new Uint8Array(256);
    this.SZHV_inc = new Uint8Array(256);
    this.SZHV_dec = new Uint8Array(256);
    this.parityTable = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      let p = 0;
      for (let b = 0; b < 8; b++) {
        if ((i >> b) & 1) p++;
      }
      this.parityTable[i] = (p % 2 === 0) ? 0x04 : 0x00; // P/V flag is bit 2

      let sz = 0;
      if (i === 0) sz |= 0x40; // Z
      if (i & 0x80) sz |= 0x80; // S
      sz |= (i & (0x20 | 0x08)); // Y (bit 5), X (bit 3)

      this.SZ[i] = sz;
      this.SZ_BIT[i] = sz;
      this.SZP[i] = sz | this.parityTable[i];

      // INC flags (without C)
      let incF = this.SZ[i];
      if ((i & 0x0f) === 0x00) incF |= 0x10; // H flag on rollover from 0x0F to 0x10
      if (i === 0x80) incF |= 0x04; // V flag (0x7F -> 0x80 overflow)
      this.SZHV_inc[i] = incF;

      // DEC flags (without C)
      let decF = this.SZ[i] | 0x02; // N flag set
      if ((i & 0x0f) === 0x0f) decF |= 0x10; // H flag on borrow from 0x10 to 0x0F
      if (i === 0x7f) decF |= 0x04; // V flag (0x80 -> 0x7F overflow)
      this.SZHV_dec[i] = decF;
    }
  }

  reset() {
    this.a = 0xff;
    this.f = 0xff;
    this.b = 0xff;
    this.c = 0xff;
    this.d = 0xff;
    this.e = 0xff;
    this.h = 0xff;
    this.l = 0xff;

    this.a_ = 0xff;
    this.f_ = 0xff;
    this.b_ = 0xff;
    this.c_ = 0xff;
    this.d_ = 0xff;
    this.e_ = 0xff;
    this.h_ = 0xff;
    this.l_ = 0xff;

    this.ix = 0xffff;
    this.iy = 0xffff;
    this.sp = 0xffff;
    this.pc = 0x0000;
    this.i = 0;
    this.r = 0;
    this.r7 = 0;

    this.iff1 = false;
    this.iff2 = false;
    this.im = 1;
    this.halted = false;
    this.eiPending = false;
    this.tstates = 0;
  }

  // 16-bit register getters/setters
  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }

  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }

  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }

  get af() { return (this.a << 8) | this.f; }
  set af(v) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }

  get af_() { return (this.a_ << 8) | this.f_; }
  set af_(v) { this.a_ = (v >> 8) & 0xff; this.f_ = v & 0xff; }

  get bc_() { return (this.b_ << 8) | this.c_; }
  set bc_(v) { this.b_ = (v >> 8) & 0xff; this.c_ = v & 0xff; }

  get de_() { return (this.d_ << 8) | this.e_; }
  set de_(v) { this.d_ = (v >> 8) & 0xff; this.e_ = v & 0xff; }

  get hl_() { return (this.h_ << 8) | this.l_; }
  set hl_(v) { this.h_ = (v >> 8) & 0xff; this.l_ = v & 0xff; }

  get rReg() {
    return (this.r7 & 0x80) | (this.r & 0x7f);
  }
  set rReg(v) {
    this.r = v & 0x7f;
    this.r7 = v & 0x80;
  }

  incR() {
    this.r = (this.r + 1) & 0x7f;
  }

  // Stack operations
  pushWord(w) {
    this.sp = (this.sp - 1) & 0xffff;
    this.mem.writeByte(this.sp, (w >> 8) & 0xff);
    this.sp = (this.sp - 1) & 0xffff;
    this.mem.writeByte(this.sp, w & 0xff);
  }

  popWord() {
    const l = this.mem.readByte(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    const h = this.mem.readByte(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    return (h << 8) | l;
  }

  fetchByte() {
    const b = this.mem.readByte(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return b;
  }

  fetchWord() {
    const l = this.fetchByte();
    const h = this.fetchByte();
    return (h << 8) | l;
  }

  interrupt() {
    if (!this.iff1 || this.eiPending) return false;

    this.iff1 = false;
    this.iff2 = false;

    if (this.halted) {
      this.halted = false;
      this.pc = (this.pc + 1) & 0xffff;
    }

    this.pushWord(this.pc);

    if (this.im === 1 || this.im === 0) {
      this.pc = 0x0038;
      this.tstates += 13;
    } else if (this.im === 2) {
      const vectorAddr = ((this.i << 8) | 0xff) & 0xffff;
      const low = this.mem.readByte(vectorAddr);
      const high = this.mem.readByte((vectorAddr + 1) & 0xffff);
      this.pc = (high << 8) | low;
      this.tstates += 19;
    }
    return true;
  }

  nmi() {
    this.iff1 = false;
    if (this.halted) {
      this.halted = false;
      this.pc = (this.pc + 1) & 0xffff;
    }
    this.pushWord(this.pc);
    this.pc = 0x0066;
    this.tstates += 11;
  }

  step() {
    if (this.eiPending) {
      this.eiPending = false;
      this.iff1 = true;
      this.iff2 = true;
    }

    if (this.halted) {
      this.tstates += 4;
      this.incR();
      return 4;
    }

    const startT = this.tstates;
    const op = this.fetchByte();
    this.incR();

    this.executeOpcode(op);

    return this.tstates - startT;
  }

  executeOpcode(op) {
    switch (op) {
      // NOP
      case 0x00: this.tstates += 4; break;
      // LD BC, nn
      case 0x01: this.c = this.fetchByte(); this.b = this.fetchByte(); this.tstates += 10; break;
      // LD (BC), A
      case 0x02: this.mem.writeByte(this.bc, this.a); this.tstates += 7; break;
      // INC BC
      case 0x03: this.bc = (this.bc + 1) & 0xffff; this.tstates += 6; break;
      // INC B
      case 0x04: this.b = this.inc8(this.b); this.tstates += 4; break;
      // DEC B
      case 0x05: this.b = this.dec8(this.b); this.tstates += 4; break;
      // LD B, n
      case 0x06: this.b = this.fetchByte(); this.tstates += 7; break;
      // RLCA
      case 0x07: {
        const c = (this.a >> 7) & 1;
        this.a = ((this.a << 1) | c) & 0xff;
        this.f = (this.f & (0x80 | 0x40 | 0x04)) | (this.a & (0x20 | 0x08)) | c;
        this.tstates += 4;
        break;
      }
      // EX AF, AF'
      case 0x08: {
        const ta = this.a, tf = this.f;
        this.a = this.a_; this.f = this.f_;
        this.a_ = ta; this.f_ = tf;
        this.tstates += 4;
        break;
      }
      // ADD HL, BC
      case 0x09: this.hl = this.add16(this.hl, this.bc); this.tstates += 11; break;
      // LD A, (BC)
      case 0x0a: this.a = this.mem.readByte(this.bc); this.tstates += 7; break;
      // DEC BC
      case 0x0b: this.bc = (this.bc - 1) & 0xffff; this.tstates += 6; break;
      // INC C
      case 0x0c: this.c = this.inc8(this.c); this.tstates += 4; break;
      // DEC C
      case 0x0d: this.c = this.dec8(this.c); this.tstates += 4; break;
      // LD C, n
      case 0x0e: this.c = this.fetchByte(); this.tstates += 7; break;
      // RRCA
      case 0x0f: {
        const c = this.a & 1;
        this.a = ((this.a >> 1) | (c << 7)) & 0xff;
        this.f = (this.f & (0x80 | 0x40 | 0x04)) | (this.a & (0x20 | 0x08)) | c;
        this.tstates += 4;
        break;
      }
      // DJNZ e
      case 0x10: {
        const off = this.signedByte(this.fetchByte());
        this.b = (this.b - 1) & 0xff;
        if (this.b !== 0) {
          this.pc = (this.pc + off) & 0xffff;
          this.tstates += 13;
        } else {
          this.tstates += 8;
        }
        break;
      }
      // LD DE, nn
      case 0x11: this.e = this.fetchByte(); this.d = this.fetchByte(); this.tstates += 10; break;
      // LD (DE), A
      case 0x12: this.mem.writeByte(this.de, this.a); this.tstates += 7; break;
      // INC DE
      case 0x13: this.de = (this.de + 1) & 0xffff; this.tstates += 6; break;
      // INC D
      case 0x14: this.d = this.inc8(this.d); this.tstates += 4; break;
      // DEC D
      case 0x15: this.d = this.dec8(this.d); this.tstates += 4; break;
      // LD D, n
      case 0x16: this.d = this.fetchByte(); this.tstates += 7; break;
      // RLA
      case 0x17: {
        const oldC = this.f & 1;
        const newC = (this.a >> 7) & 1;
        this.a = ((this.a << 1) | oldC) & 0xff;
        this.f = (this.f & (0x80 | 0x40 | 0x04)) | (this.a & (0x20 | 0x08)) | newC;
        this.tstates += 4;
        break;
      }
      // JR e
      case 0x18: {
        const off = this.signedByte(this.fetchByte());
        this.pc = (this.pc + off) & 0xffff;
        this.tstates += 12;
        break;
      }
      // ADD HL, DE
      case 0x19: this.hl = this.add16(this.hl, this.de); this.tstates += 11; break;
      // LD A, (DE)
      case 0x1a: this.a = this.mem.readByte(this.de); this.tstates += 7; break;
      // DEC DE
      case 0x1b: this.de = (this.de - 1) & 0xffff; this.tstates += 6; break;
      // INC E
      case 0x1c: this.e = this.inc8(this.e); this.tstates += 4; break;
      // DEC E
      case 0x1d: this.e = this.dec8(this.e); this.tstates += 4; break;
      // LD E, n
      case 0x1e: this.e = this.fetchByte(); this.tstates += 7; break;
      // RRA
      case 0x1f: {
        const oldC = this.f & 1;
        const newC = this.a & 1;
        this.a = ((this.a >> 1) | (oldC << 7)) & 0xff;
        this.f = (this.f & (0x80 | 0x40 | 0x04)) | (this.a & (0x20 | 0x08)) | newC;
        this.tstates += 4;
        break;
      }
      // JR NZ, e
      case 0x20: {
        const off = this.signedByte(this.fetchByte());
        if (!(this.f & 0x40)) { this.pc = (this.pc + off) & 0xffff; this.tstates += 12; }
        else { this.tstates += 7; }
        break;
      }
      // LD HL, nn
      case 0x21: this.l = this.fetchByte(); this.h = this.fetchByte(); this.tstates += 10; break;
      // LD (nn), HL
      case 0x22: {
        const addr = this.fetchWord();
        this.mem.writeByte(addr, this.l);
        this.mem.writeByte((addr + 1) & 0xffff, this.h);
        this.tstates += 16;
        break;
      }
      // INC HL
      case 0x23: this.hl = (this.hl + 1) & 0xffff; this.tstates += 6; break;
      // INC H
      case 0x24: this.h = this.inc8(this.h); this.tstates += 4; break;
      // DEC H
      case 0x25: this.h = this.dec8(this.h); this.tstates += 4; break;
      // LD H, n
      case 0x26: this.h = this.fetchByte(); this.tstates += 7; break;
      // DAA
      case 0x27: this.daa(); this.tstates += 4; break;
      // JR Z, e
      case 0x28: {
        const off = this.signedByte(this.fetchByte());
        if (this.f & 0x40) { this.pc = (this.pc + off) & 0xffff; this.tstates += 12; }
        else { this.tstates += 7; }
        break;
      }
      // ADD HL, HL
      case 0x29: this.hl = this.add16(this.hl, this.hl); this.tstates += 11; break;
      // LD HL, (nn)
      case 0x2a: {
        const addr = this.fetchWord();
        this.l = this.mem.readByte(addr);
        this.h = this.mem.readByte((addr + 1) & 0xffff);
        this.tstates += 16;
        break;
      }
      // DEC HL
      case 0x2b: this.hl = (this.hl - 1) & 0xffff; this.tstates += 6; break;
      // INC L
      case 0x2c: this.l = this.inc8(this.l); this.tstates += 4; break;
      // DEC L
      case 0x2d: this.l = this.dec8(this.l); this.tstates += 4; break;
      // LD L, n
      case 0x2e: this.l = this.fetchByte(); this.tstates += 7; break;
      // CPL
      case 0x2f:
        this.a ^= 0xff;
        this.f = (this.f & (0x80 | 0x40 | 0x04 | 0x01)) | 0x12 | (this.a & (0x20 | 0x08));
        this.tstates += 4;
        break;
      // JR NC, e
      case 0x30: {
        const off = this.signedByte(this.fetchByte());
        if (!(this.f & 0x01)) { this.pc = (this.pc + off) & 0xffff; this.tstates += 12; }
        else { this.tstates += 7; }
        break;
      }
      // LD SP, nn
      case 0x31: this.sp = this.fetchWord(); this.tstates += 10; break;
      // LD (nn), A
      case 0x32: {
        const addr = this.fetchWord();
        this.mem.writeByte(addr, this.a);
        this.tstates += 13;
        break;
      }
      // INC SP
      case 0x33: this.sp = (this.sp + 1) & 0xffff; this.tstates += 6; break;
      // INC (HL)
      case 0x34: {
        const hl = this.hl;
        const v = this.inc8(this.mem.readByte(hl));
        this.mem.writeByte(hl, v);
        this.tstates += 11;
        break;
      }
      // DEC (HL)
      case 0x35: {
        const hl = this.hl;
        const v = this.dec8(this.mem.readByte(hl));
        this.mem.writeByte(hl, v);
        this.tstates += 11;
        break;
      }
      // LD (HL), n
      case 0x36: this.mem.writeByte(this.hl, this.fetchByte()); this.tstates += 10; break;
      // SCF
      case 0x37:
        this.f = (this.f & (0x80 | 0x40 | 0x04)) | (this.a & (0x20 | 0x08)) | 0x01;
        this.tstates += 4;
        break;
      // JR C, e
      case 0x38: {
        const off = this.signedByte(this.fetchByte());
        if (this.f & 0x01) { this.pc = (this.pc + off) & 0xffff; this.tstates += 12; }
        else { this.tstates += 7; }
        break;
      }
      // ADD HL, SP
      case 0x39: this.hl = this.add16(this.hl, this.sp); this.tstates += 11; break;
      // LD A, (nn)
      case 0x3a: {
        const addr = this.fetchWord();
        this.a = this.mem.readByte(addr);
        this.tstates += 13;
        break;
      }
      // DEC SP
      case 0x3b: this.sp = (this.sp - 1) & 0xffff; this.tstates += 6; break;
      // INC A
      case 0x3c: this.a = this.inc8(this.a); this.tstates += 4; break;
      // DEC A
      case 0x3d: this.a = this.dec8(this.a); this.tstates += 4; break;
      // LD A, n
      case 0x3e: this.a = this.fetchByte(); this.tstates += 7; break;
      // CCF
      case 0x3f: {
        const c = this.f & 1;
        this.f = (this.f & (0x80 | 0x40 | 0x04)) | (c ? 0x10 : 0x00) | (this.a & (0x20 | 0x08)) | (c ^ 1);
        this.tstates += 4;
        break;
      }

      // LD B, r
      case 0x40: this.tstates += 4; break; // LD B, B
      case 0x41: this.b = this.c; this.tstates += 4; break;
      case 0x42: this.b = this.d; this.tstates += 4; break;
      case 0x43: this.b = this.e; this.tstates += 4; break;
      case 0x44: this.b = this.h; this.tstates += 4; break;
      case 0x45: this.b = this.l; this.tstates += 4; break;
      case 0x46: this.b = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x47: this.b = this.a; this.tstates += 4; break;

      // LD C, r
      case 0x48: this.c = this.b; this.tstates += 4; break;
      case 0x49: this.tstates += 4; break;
      case 0x4a: this.c = this.d; this.tstates += 4; break;
      case 0x4b: this.c = this.e; this.tstates += 4; break;
      case 0x4c: this.c = this.h; this.tstates += 4; break;
      case 0x4d: this.c = this.l; this.tstates += 4; break;
      case 0x4e: this.c = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x4f: this.c = this.a; this.tstates += 4; break;

      // LD D, r
      case 0x50: this.d = this.b; this.tstates += 4; break;
      case 0x51: this.d = this.c; this.tstates += 4; break;
      case 0x52: this.tstates += 4; break;
      case 0x53: this.d = this.e; this.tstates += 4; break;
      case 0x54: this.d = this.h; this.tstates += 4; break;
      case 0x55: this.d = this.l; this.tstates += 4; break;
      case 0x56: this.d = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x57: this.d = this.a; this.tstates += 4; break;

      // LD E, r
      case 0x58: this.e = this.b; this.tstates += 4; break;
      case 0x59: this.e = this.c; this.tstates += 4; break;
      case 0x5a: this.e = this.d; this.tstates += 4; break;
      case 0x5b: this.tstates += 4; break;
      case 0x5c: this.e = this.h; this.tstates += 4; break;
      case 0x5d: this.e = this.l; this.tstates += 4; break;
      case 0x5e: this.e = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x5f: this.e = this.a; this.tstates += 4; break;

      // LD H, r
      case 0x60: this.h = this.b; this.tstates += 4; break;
      case 0x61: this.h = this.c; this.tstates += 4; break;
      case 0x62: this.h = this.d; this.tstates += 4; break;
      case 0x63: this.h = this.e; this.tstates += 4; break;
      case 0x64: this.tstates += 4; break;
      case 0x65: this.h = this.l; this.tstates += 4; break;
      case 0x66: this.h = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x67: this.h = this.a; this.tstates += 4; break;

      // LD L, r
      case 0x68: this.l = this.b; this.tstates += 4; break;
      case 0x69: this.l = this.c; this.tstates += 4; break;
      case 0x6a: this.l = this.d; this.tstates += 4; break;
      case 0x6b: this.l = this.e; this.tstates += 4; break;
      case 0x6c: this.l = this.h; this.tstates += 4; break;
      case 0x6d: this.tstates += 4; break;
      case 0x6e: this.l = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x6f: this.l = this.a; this.tstates += 4; break;

      // LD (HL), r
      case 0x70: this.mem.writeByte(this.hl, this.b); this.tstates += 7; break;
      case 0x71: this.mem.writeByte(this.hl, this.c); this.tstates += 7; break;
      case 0x72: this.mem.writeByte(this.hl, this.d); this.tstates += 7; break;
      case 0x73: this.mem.writeByte(this.hl, this.e); this.tstates += 7; break;
      case 0x74: this.mem.writeByte(this.hl, this.h); this.tstates += 7; break;
      case 0x75: this.mem.writeByte(this.hl, this.l); this.tstates += 7; break;
      case 0x76: this.halted = true; this.pc = (this.pc - 1) & 0xffff; this.tstates += 4; break; // HALT
      case 0x77: this.mem.writeByte(this.hl, this.a); this.tstates += 7; break;

      // LD A, r
      case 0x78: this.a = this.b; this.tstates += 4; break;
      case 0x79: this.a = this.c; this.tstates += 4; break;
      case 0x7a: this.a = this.d; this.tstates += 4; break;
      case 0x7b: this.a = this.e; this.tstates += 4; break;
      case 0x7c: this.a = this.h; this.tstates += 4; break;
      case 0x7d: this.a = this.l; this.tstates += 4; break;
      case 0x7e: this.a = this.mem.readByte(this.hl); this.tstates += 7; break;
      case 0x7f: this.tstates += 4; break;

      // ADD A, r
      case 0x80: this.add8(this.b); this.tstates += 4; break;
      case 0x81: this.add8(this.c); this.tstates += 4; break;
      case 0x82: this.add8(this.d); this.tstates += 4; break;
      case 0x83: this.add8(this.e); this.tstates += 4; break;
      case 0x84: this.add8(this.h); this.tstates += 4; break;
      case 0x85: this.add8(this.l); this.tstates += 4; break;
      case 0x86: this.add8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0x87: this.add8(this.a); this.tstates += 4; break;

      // ADC A, r
      case 0x88: this.adc8(this.b); this.tstates += 4; break;
      case 0x89: this.adc8(this.c); this.tstates += 4; break;
      case 0x8a: this.adc8(this.d); this.tstates += 4; break;
      case 0x8b: this.adc8(this.e); this.tstates += 4; break;
      case 0x8c: this.adc8(this.h); this.tstates += 4; break;
      case 0x8d: this.adc8(this.l); this.tstates += 4; break;
      case 0x8e: this.adc8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0x8f: this.adc8(this.a); this.tstates += 4; break;

      // SUB r
      case 0x90: this.sub8(this.b); this.tstates += 4; break;
      case 0x91: this.sub8(this.c); this.tstates += 4; break;
      case 0x92: this.sub8(this.d); this.tstates += 4; break;
      case 0x93: this.sub8(this.e); this.tstates += 4; break;
      case 0x94: this.sub8(this.h); this.tstates += 4; break;
      case 0x95: this.sub8(this.l); this.tstates += 4; break;
      case 0x96: this.sub8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0x97: this.sub8(this.a); this.tstates += 4; break;

      // SBC A, r
      case 0x98: this.sbc8(this.b); this.tstates += 4; break;
      case 0x99: this.sbc8(this.c); this.tstates += 4; break;
      case 0x9a: this.sbc8(this.d); this.tstates += 4; break;
      case 0x9b: this.sbc8(this.e); this.tstates += 4; break;
      case 0x9c: this.sbc8(this.h); this.tstates += 4; break;
      case 0x9d: this.sbc8(this.l); this.tstates += 4; break;
      case 0x9e: this.sbc8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0x9f: this.sbc8(this.a); this.tstates += 4; break;

      // AND r
      case 0xa0: this.and8(this.b); this.tstates += 4; break;
      case 0xa1: this.and8(this.c); this.tstates += 4; break;
      case 0xa2: this.and8(this.d); this.tstates += 4; break;
      case 0xa3: this.and8(this.e); this.tstates += 4; break;
      case 0xa4: this.and8(this.h); this.tstates += 4; break;
      case 0xa5: this.and8(this.l); this.tstates += 4; break;
      case 0xa6: this.and8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0xa7: this.and8(this.a); this.tstates += 4; break;

      // XOR r
      case 0xa8: this.xor8(this.b); this.tstates += 4; break;
      case 0xa9: this.xor8(this.c); this.tstates += 4; break;
      case 0xaa: this.xor8(this.d); this.tstates += 4; break;
      case 0xab: this.xor8(this.e); this.tstates += 4; break;
      case 0xac: this.xor8(this.h); this.tstates += 4; break;
      case 0xad: this.xor8(this.l); this.tstates += 4; break;
      case 0xae: this.xor8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0xaf: this.xor8(this.a); this.tstates += 4; break;

      // OR r
      case 0xb0: this.or8(this.b); this.tstates += 4; break;
      case 0xb1: this.or8(this.c); this.tstates += 4; break;
      case 0xb2: this.or8(this.d); this.tstates += 4; break;
      case 0xb3: this.or8(this.e); this.tstates += 4; break;
      case 0xb4: this.or8(this.h); this.tstates += 4; break;
      case 0xb5: this.or8(this.l); this.tstates += 4; break;
      case 0xb6: this.or8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0xb7: this.or8(this.a); this.tstates += 4; break;

      // CP r
      case 0xb8: this.cp8(this.b); this.tstates += 4; break;
      case 0xb9: this.cp8(this.c); this.tstates += 4; break;
      case 0xba: this.cp8(this.d); this.tstates += 4; break;
      case 0xbb: this.cp8(this.e); this.tstates += 4; break;
      case 0xbc: this.cp8(this.h); this.tstates += 4; break;
      case 0xbd: this.cp8(this.l); this.tstates += 4; break;
      case 0xbe: this.cp8(this.mem.readByte(this.hl)); this.tstates += 7; break;
      case 0xbf: this.cp8(this.a); this.tstates += 4; break;

      // RET NZ
      case 0xc0:
        if (!(this.f & 0x40)) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // POP BC
      case 0xc1: this.bc = this.popWord(); this.tstates += 10; break;
      // JP NZ, nn
      case 0xc2: {
        const addr = this.fetchWord();
        if (!(this.f & 0x40)) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // JP nn
      case 0xc3: this.pc = this.fetchWord(); this.tstates += 10; break;
      // CALL NZ, nn
      case 0xc4: {
        const addr = this.fetchWord();
        if (!(this.f & 0x40)) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // PUSH BC
      case 0xc5: this.pushWord(this.bc); this.tstates += 11; break;
      // ADD A, n
      case 0xc6: this.add8(this.fetchByte()); this.tstates += 7; break;
      // RST 00h
      case 0xc7: this.pushWord(this.pc); this.pc = 0x0000; this.tstates += 11; break;
      // RET Z
      case 0xc8:
        if (this.f & 0x40) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // RET
      case 0xc9: this.pc = this.popWord(); this.tstates += 10; break;
      // JP Z, nn
      case 0xca: {
        const addr = this.fetchWord();
        if (this.f & 0x40) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // Prefix CB
      case 0xcb: this.executeCB(); break;
      // CALL Z, nn
      case 0xcc: {
        const addr = this.fetchWord();
        if (this.f & 0x40) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // CALL nn
      case 0xcd: {
        const addr = this.fetchWord();
        this.pushWord(this.pc);
        this.pc = addr;
        this.tstates += 17;
        break;
      }
      // ADC A, n
      case 0xce: this.adc8(this.fetchByte()); this.tstates += 7; break;
      // RST 08h
      case 0xcf: this.pushWord(this.pc); this.pc = 0x0008; this.tstates += 11; break;

      // RET NC
      case 0xd0:
        if (!(this.f & 0x01)) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // POP DE
      case 0xd1: this.de = this.popWord(); this.tstates += 10; break;
      // JP NC, nn
      case 0xd2: {
        const addr = this.fetchWord();
        if (!(this.f & 0x01)) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // OUT (n), A
      case 0xd3: {
        const port = this.fetchByte() | (this.a << 8);
        this.mem.writePort(port, this.a);
        this.tstates += 11;
        break;
      }
      // CALL NC, nn
      case 0xd4: {
        const addr = this.fetchWord();
        if (!(this.f & 0x01)) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // PUSH DE
      case 0xd5: this.pushWord(this.de); this.tstates += 11; break;
      // SUB n
      case 0xd6: this.sub8(this.fetchByte()); this.tstates += 7; break;
      // RST 10h
      case 0xd7: this.pushWord(this.pc); this.pc = 0x0010; this.tstates += 11; break;
      // RET C
      case 0xd8:
        if (this.f & 0x01) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // EXX
      case 0xd9: {
        let t = this.bc; this.bc = this.bc_; this.bc_ = t;
        t = this.de; this.de = this.de_; this.de_ = t;
        t = this.hl; this.hl = this.hl_; this.hl_ = t;
        this.tstates += 4;
        break;
      }
      // JP C, nn
      case 0xda: {
        const addr = this.fetchWord();
        if (this.f & 0x01) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // IN A, (n)
      case 0xdb: {
        const port = this.fetchByte() | (this.a << 8);
        // The input byte is sampled on the final (T4) I/O cycle.
        this.a = this.mem.readPort(port, 10);
        this.tstates += 11;
        break;
      }
      // CALL C, nn
      case 0xdc: {
        const addr = this.fetchWord();
        if (this.f & 0x01) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // Prefix DD (IX)
      case 0xdd: this.executeIndex('ix'); break;
      // SBC A, n
      case 0xde: this.sbc8(this.fetchByte()); this.tstates += 7; break;
      // RST 18h
      case 0xdf: this.pushWord(this.pc); this.pc = 0x0018; this.tstates += 11; break;

      // RET PO
      case 0xe0:
        if (!(this.f & 0x04)) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // POP HL
      case 0xe1: this.hl = this.popWord(); this.tstates += 10; break;
      // JP PO, nn
      case 0xe2: {
        const addr = this.fetchWord();
        if (!(this.f & 0x04)) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // EX (SP), HL
      case 0xe3: {
        const spl = this.mem.readByte(this.sp);
        const sph = this.mem.readByte((this.sp + 1) & 0xffff);
        this.mem.writeByte(this.sp, this.l);
        this.mem.writeByte((this.sp + 1) & 0xffff, this.h);
        this.l = spl; this.h = sph;
        this.tstates += 19;
        break;
      }
      // CALL PO, nn
      case 0xe4: {
        const addr = this.fetchWord();
        if (!(this.f & 0x04)) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // PUSH HL
      case 0xe5: this.pushWord(this.hl); this.tstates += 11; break;
      // AND n
      case 0xe6: this.and8(this.fetchByte()); this.tstates += 7; break;
      // RST 20h
      case 0xe7: this.pushWord(this.pc); this.pc = 0x0020; this.tstates += 11; break;
      // RET PE
      case 0xe8:
        if (this.f & 0x04) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // JP (HL)
      case 0xe9: this.pc = this.hl; this.tstates += 4; break;
      // JP PE, nn
      case 0xea: {
        const addr = this.fetchWord();
        if (this.f & 0x04) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // EX DE, HL
      case 0xeb: {
        const t = this.de; this.de = this.hl; this.hl = t;
        this.tstates += 4;
        break;
      }
      // CALL PE, nn
      case 0xec: {
        const addr = this.fetchWord();
        if (this.f & 0x04) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // Prefix ED
      case 0xed: this.executeED(); break;
      // XOR n
      case 0xee: this.xor8(this.fetchByte()); this.tstates += 7; break;
      // RST 28h
      case 0xef: this.pushWord(this.pc); this.pc = 0x0028; this.tstates += 11; break;

      // RET P
      case 0xf0:
        if (!(this.f & 0x80)) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // POP AF
      case 0xf1: this.af = this.popWord(); this.tstates += 10; break;
      // JP P, nn
      case 0xf2: {
        const addr = this.fetchWord();
        if (!(this.f & 0x80)) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // DI
      case 0xf3: this.iff1 = false; this.iff2 = false; this.tstates += 4; break;
      // CALL P, nn
      case 0xf4: {
        const addr = this.fetchWord();
        if (!(this.f & 0x80)) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // PUSH AF
      case 0xf5: this.pushWord(this.af); this.tstates += 11; break;
      // OR n
      case 0xf6: this.or8(this.fetchByte()); this.tstates += 7; break;
      // RST 30h
      case 0xf7: this.pushWord(this.pc); this.pc = 0x0030; this.tstates += 11; break;
      // RET M
      case 0xf8:
        if (this.f & 0x80) { this.pc = this.popWord(); this.tstates += 11; }
        else { this.tstates += 5; }
        break;
      // LD SP, HL
      case 0xf9: this.sp = this.hl; this.tstates += 6; break;
      // JP M, nn
      case 0xfa: {
        const addr = this.fetchWord();
        if (this.f & 0x80) this.pc = addr;
        this.tstates += 10;
        break;
      }
      // EI
      case 0xfb: this.eiPending = true; this.tstates += 4; break;
      // CALL M, nn
      case 0xfc: {
        const addr = this.fetchWord();
        if (this.f & 0x80) { this.pushWord(this.pc); this.pc = addr; this.tstates += 17; }
        else { this.tstates += 10; }
        break;
      }
      // Prefix FD (IY)
      case 0xfd: this.executeIndex('iy'); break;
      // CP n
      case 0xfe: this.cp8(this.fetchByte()); this.tstates += 7; break;
      // RST 38h
      case 0xff: this.pushWord(this.pc); this.pc = 0x0038; this.tstates += 11; break;
    }
  }

  // Helper arithmetic/logic methods
  signedByte(b) {
    return (b & 0x80) ? b - 256 : b;
  }

  inc8(val) {
    const res = (val + 1) & 0xff;
    this.f = (this.f & 0x01) | this.SZHV_inc[res];
    return res;
  }

  dec8(val) {
    const res = (val - 1) & 0xff;
    this.f = (this.f & 0x01) | this.SZHV_dec[res];
    return res;
  }

  add8(val) {
    const sum = this.a + val;
    const res = sum & 0xff;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((res & 0x88) >> 1);
    let f = this.SZ[res];
    if (sum > 0xff) f |= 0x01; // Carry
    if ((this.a & 0x0f) + (val & 0x0f) > 0x0f) f |= 0x10; // Half carry
    if ((lookup === 1 || lookup === 6)) f |= 0x04; // Overflow
    this.a = res;
    this.f = f;
  }

  adc8(val) {
    const c = this.f & 0x01;
    const sum = this.a + val + c;
    const res = sum & 0xff;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((res & 0x88) >> 1);
    let f = this.SZ[res];
    if (sum > 0xff) f |= 0x01;
    if ((this.a & 0x0f) + (val & 0x0f) + c > 0x0f) f |= 0x10;
    if ((lookup === 1 || lookup === 6)) f |= 0x04;
    this.a = res;
    this.f = f;
  }

  sub8(val) {
    const diff = this.a - val;
    const res = diff & 0xff;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((res & 0x88) >> 1);
    let f = this.SZ[res] | 0x02; // N set
    if (diff < 0) f |= 0x01;
    if ((this.a & 0x0f) < (val & 0x0f)) f |= 0x10;
    if ((lookup === 2 || lookup === 5)) f |= 0x04;
    this.a = res;
    this.f = f;
  }

  sbc8(val) {
    const c = this.f & 0x01;
    const diff = this.a - val - c;
    const res = diff & 0xff;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((res & 0x88) >> 1);
    let f = this.SZ[res] | 0x02;
    if (diff < 0) f |= 0x01;
    if ((this.a & 0x0f) < (val & 0x0f) + c) f |= 0x10;
    if ((lookup === 2 || lookup === 5)) f |= 0x04;
    this.a = res;
    this.f = f;
  }

  and8(val) {
    this.a = (this.a & val) & 0xff;
    this.f = this.SZP[this.a] | 0x10; // H set, N/C reset
  }

  xor8(val) {
    this.a = (this.a ^ val) & 0xff;
    this.f = this.SZP[this.a];
  }

  or8(val) {
    this.a = (this.a | val) & 0xff;
    this.f = this.SZP[this.a];
  }

  cp8(val) {
    const diff = this.a - val;
    const res = diff & 0xff;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((res & 0x88) >> 1);
    let f = (this.SZ[res] & (0x80 | 0x40)) | (val & (0x20 | 0x08)) | 0x02; // N set, Y/X from val!
    if (diff < 0) f |= 0x01;
    if ((this.a & 0x0f) < (val & 0x0f)) f |= 0x10;
    if ((lookup === 2 || lookup === 5)) f |= 0x04;
    this.f = f;
  }

  add16(dest, src) {
    const sum = dest + src;
    const res = sum & 0xffff;
    let f = (this.f & (0x80 | 0x40 | 0x04)) | ((res >> 8) & (0x20 | 0x08));
    if (sum > 0xffff) f |= 0x01;
    if ((dest & 0x0fff) + (src & 0x0fff) > 0x0fff) f |= 0x10;
    this.f = f;
    return res;
  }

  adc16(dest, src) {
    const c = this.f & 0x01;
    const sum = dest + src + c;
    const res = sum & 0xffff;
    const lookup = ((dest & 0x8800) >> 11) | ((src & 0x8800) >> 10) | ((res & 0x8800) >> 9);
    let f = (this.SZ[res >> 8] & 0x80) | ((res === 0) ? 0x40 : 0) | ((res >> 8) & (0x20 | 0x08));
    if (sum > 0xffff) f |= 0x01;
    if ((dest & 0x0fff) + (src & 0x0fff) + c > 0x0fff) f |= 0x10;
    if (lookup === 1 || lookup === 6) f |= 0x04;
    this.f = f;
    return res;
  }

  sbc16(dest, src) {
    const c = this.f & 0x01;
    const diff = dest - src - c;
    const res = diff & 0xffff;
    const lookup = ((dest & 0x8800) >> 11) | ((src & 0x8800) >> 10) | ((res & 0x8800) >> 9);
    let f = (this.SZ[res >> 8] & 0x80) | ((res === 0) ? 0x40 : 0) | ((res >> 8) & (0x20 | 0x08)) | 0x02;
    if (diff < 0) f |= 0x01;
    if ((dest & 0x0fff) < (src & 0x0fff) + c) f |= 0x10;
    if (lookup === 2 || lookup === 5) f |= 0x04;
    this.f = f;
    return res;
  }

  daa() {
    let a = this.a;
    let f = this.f;
    let incr = 0;
    const c = f & 0x01;
    const h = f & 0x10;
    const n = f & 0x02;

    if (h || ((a & 0x0f) > 9)) incr |= 0x06;
    if (c || (a > 0x99)) {
      incr |= 0x60;
      f |= 0x01;
    } else {
      f &= ~0x01;
    }

    if (n) {
      a = (a - incr) & 0xff;
    } else {
      a = (a + incr) & 0xff;
    }

    this.a = a;
    this.f = (f & (0x01 | 0x02)) | this.SZP[a] | (h ? 0x10 : 0x00);
  }

  // Prefix CB: Bitwise / Shifts
  executeCB() {
    this.incR();
    const op = this.fetchByte();
    const regIdx = op & 0x07;
    const bit = (op >> 3) & 0x07;
    const group = op >> 6;

    let val = this.getRegByIndex(regIdx);
    const isHL = (regIdx === 6);
    this.tstates += isHL ? 15 : 8;

    if (group === 0) {
      // Shift / Rotate
      const shiftOp = (op >> 3) & 0x07;
      let c = 0;
      switch (shiftOp) {
        case 0: // RLC
          c = (val >> 7) & 1;
          val = ((val << 1) | c) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 1: // RRC
          c = val & 1;
          val = ((val >> 1) | (c << 7)) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 2: // RL
          c = (val >> 7) & 1;
          val = ((val << 1) | (this.f & 1)) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 3: // RR
          c = val & 1;
          val = ((val >> 1) | ((this.f & 1) << 7)) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 4: // SLA
          c = (val >> 7) & 1;
          val = (val << 1) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 5: // SRA
          c = val & 1;
          val = ((val >> 1) | (val & 0x80)) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 6: // SLL (undocumented)
          c = (val >> 7) & 1;
          val = ((val << 1) | 1) & 0xff;
          this.f = this.SZP[val] | c;
          break;
        case 7: // SRL
          c = val & 1;
          val = (val >> 1) & 0xff;
          this.f = this.SZP[val] | c;
          break;
      }
      this.setRegByIndex(regIdx, val);
    } else if (group === 1) {
      // BIT b, r
      const bitVal = val & (1 << bit);
      let f = (this.f & 0x01) | 0x10; // C preserved, H set, N reset
      if (bitVal === 0) f |= 0x44; // Z and P/V set
      if (bit === 7 && bitVal) f |= 0x80; // S set
      // Y, X flags copied from val or addr if (HL)
      if (isHL) {
        this.tstates -= 3; // BIT (HL) is 12 T-states, not 15
        f |= ((this.hl >> 8) & (0x20 | 0x08));
      } else {
        f |= (val & (0x20 | 0x08));
      }
      this.f = f;
    } else if (group === 2) {
      // RES b, r
      val &= ~(1 << bit);
      this.setRegByIndex(regIdx, val);
    } else if (group === 3) {
      // SET b, r
      val |= (1 << bit);
      this.setRegByIndex(regIdx, val);
    }
  }

  getRegByIndex(idx) {
    switch (idx) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return this.h;
      case 5: return this.l;
      case 6: return this.mem.readByte(this.hl);
      case 7: return this.a;
    }
    return 0;
  }

  setRegByIndex(idx, val) {
    switch (idx) {
      case 0: this.b = val; break;
      case 1: this.c = val; break;
      case 2: this.d = val; break;
      case 3: this.e = val; break;
      case 4: this.h = val; break;
      case 5: this.l = val; break;
      case 6: this.mem.writeByte(this.hl, val); break;
      case 7: this.a = val; break;
    }
  }

  // Prefix ED: Extended Instructions
  executeED() {
    this.incR();
    const op = this.fetchByte();
    switch (op) {
      // IN r, (C)
      case 0x40: this.inReg('b'); break;
      case 0x48: this.inReg('c'); break;
      case 0x50: this.inReg('d'); break;
      case 0x58: this.inReg('e'); break;
      case 0x60: this.inReg('h'); break;
      case 0x68: this.inReg('l'); break;
      case 0x70: this.inReg(null); break; // IN (C) - sets flags only
      case 0x78: this.inReg('a'); break;

      // OUT (C), r
      case 0x41: this.mem.writePort(this.bc, this.b); this.tstates += 12; break;
      case 0x49: this.mem.writePort(this.bc, this.c); this.tstates += 12; break;
      case 0x51: this.mem.writePort(this.bc, this.d); this.tstates += 12; break;
      case 0x59: this.mem.writePort(this.bc, this.e); this.tstates += 12; break;
      case 0x61: this.mem.writePort(this.bc, this.h); this.tstates += 12; break;
      case 0x69: this.mem.writePort(this.bc, this.l); this.tstates += 12; break;
      case 0x71: this.mem.writePort(this.bc, 0); this.tstates += 12; break;
      case 0x79: this.mem.writePort(this.bc, this.a); this.tstates += 12; break;

      // SBC HL, rr
      case 0x42: this.hl = this.sbc16(this.hl, this.bc); this.tstates += 15; break;
      case 0x52: this.hl = this.sbc16(this.hl, this.de); this.tstates += 15; break;
      case 0x62: this.hl = this.sbc16(this.hl, this.hl); this.tstates += 15; break;
      case 0x72: this.hl = this.sbc16(this.hl, this.sp); this.tstates += 15; break;

      // ADC HL, rr
      case 0x4a: this.hl = this.adc16(this.hl, this.bc); this.tstates += 15; break;
      case 0x5a: this.hl = this.adc16(this.hl, this.de); this.tstates += 15; break;
      case 0x6a: this.hl = this.adc16(this.hl, this.hl); this.tstates += 15; break;
      case 0x7a: this.hl = this.adc16(this.hl, this.sp); this.tstates += 15; break;

      // LD (nn), rr
      case 0x43: {
        const addr = this.fetchWord();
        this.mem.writeByte(addr, this.c);
        this.mem.writeByte((addr + 1) & 0xffff, this.b);
        this.tstates += 20;
        break;
      }
      case 0x53: {
        const addr = this.fetchWord();
        this.mem.writeByte(addr, this.e);
        this.mem.writeByte((addr + 1) & 0xffff, this.d);
        this.tstates += 20;
        break;
      }
      case 0x63: {
        const addr = this.fetchWord();
        this.mem.writeByte(addr, this.l);
        this.mem.writeByte((addr + 1) & 0xffff, this.h);
        this.tstates += 20;
        break;
      }
      case 0x73: {
        const addr = this.fetchWord();
        this.mem.writeByte(addr, this.sp & 0xff);
        this.mem.writeByte((addr + 1) & 0xffff, (this.sp >> 8) & 0xff);
        this.tstates += 20;
        break;
      }

      // LD rr, (nn)
      case 0x4b: {
        const addr = this.fetchWord();
        this.c = this.mem.readByte(addr);
        this.b = this.mem.readByte((addr + 1) & 0xffff);
        this.tstates += 20;
        break;
      }
      case 0x5b: {
        const addr = this.fetchWord();
        this.e = this.mem.readByte(addr);
        this.d = this.mem.readByte((addr + 1) & 0xffff);
        this.tstates += 20;
        break;
      }
      case 0x6b: {
        const addr = this.fetchWord();
        this.l = this.mem.readByte(addr);
        this.h = this.mem.readByte((addr + 1) & 0xffff);
        this.tstates += 20;
        break;
      }
      case 0x7b: {
        const addr = this.fetchWord();
        this.sp = this.mem.readByte(addr) | (this.mem.readByte((addr + 1) & 0xffff) << 8);
        this.tstates += 20;
        break;
      }

      // NEG
      case 0x44: case 0x4c: case 0x54: case 0x5c: case 0x64: case 0x6c: case 0x74: case 0x7c: {
        const origA = this.a;
        this.a = 0;
        this.sub8(origA);
        this.tstates += 8;
        break;
      }

      // RETN / RETI
      case 0x45: case 0x55: case 0x65: case 0x75:
      case 0x4d: case 0x5d: case 0x6d: case 0x7d:
        this.pc = this.popWord();
        this.iff1 = this.iff2;
        this.tstates += 14;
        break;

      // IM 0, 1, 2
      case 0x46: case 0x66: this.im = 0; this.tstates += 8; break;
      case 0x56: case 0x76: this.im = 1; this.tstates += 8; break;
      case 0x5e: case 0x7e: this.im = 2; this.tstates += 8; break;

      // LD I, A
      case 0x47: this.i = this.a; this.tstates += 9; break;
      // LD R, A
      case 0x4f: this.rReg = this.a; this.tstates += 9; break;
      // LD A, I
      case 0x57: {
        this.a = this.i;
        this.f = (this.f & 0x01) | this.SZ[this.a] | (this.iff2 ? 0x04 : 0);
        this.tstates += 9;
        break;
      }
      // LD A, R
      case 0x5f: {
        this.a = this.rReg;
        this.f = (this.f & 0x01) | this.SZ[this.a] | (this.iff2 ? 0x04 : 0);
        this.tstates += 9;
        break;
      }

      // RRD
      case 0x67: {
        const hlVal = this.mem.readByte(this.hl);
        const lowA = this.a & 0x0f;
        this.a = (this.a & 0xf0) | (hlVal & 0x0f);
        this.mem.writeByte(this.hl, (lowA << 4) | (hlVal >> 4));
        this.f = (this.f & 0x01) | this.SZP[this.a];
        this.tstates += 18;
        break;
      }
      // RLD
      case 0x6f: {
        const hlVal = this.mem.readByte(this.hl);
        const lowA = this.a & 0x0f;
        this.a = (this.a & 0xf0) | (hlVal >> 4);
        this.mem.writeByte(this.hl, ((hlVal & 0x0f) << 4) | lowA);
        this.f = (this.f & 0x01) | this.SZP[this.a];
        this.tstates += 18;
        break;
      }

      // Block Transfer
      case 0xa0: this.ldi(); break;
      case 0xb0: this.ldir(); break;
      case 0xa8: this.ldd(); break;
      case 0xb8: this.lddr(); break;

      // Block Search
      case 0xa1: this.cpi(); break;
      case 0xb1: this.cpir(); break;
      case 0xa9: this.cpd(); break;
      case 0xb9: this.cpdr(); break;

      // Block I/O
      case 0xa2: this.ini(); break;
      case 0xb2: this.inir(); break;
      case 0xaa: this.ind(); break;
      case 0xba: this.indr(); break;
      case 0xa3: this.outi(); break;
      case 0xb3: this.otir(); break;
      case 0xab: this.outd(); break;
      case 0xbb: this.otdr(); break;

      default:
        // NOP on invalid ED
        this.tstates += 8;
        break;
    }
  }

  inReg(reg) {
    const val = this.mem.readPort(this.bc, 11);
    if (reg) this[reg] = val;
    this.f = (this.f & 0x01) | this.SZP[val];
    this.tstates += 12;
  }

  ldi() {
    const val = this.mem.readByte(this.hl);
    this.mem.writeByte(this.de, val);
    this.hl = (this.hl + 1) & 0xffff;
    this.de = (this.de + 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    const n = (this.a + val) & 0xff;
    this.f = (this.f & (0x80 | 0x40 | 0x01)) | (this.bc !== 0 ? 0x04 : 0) | (n & 0x08) | ((n & 0x02) << 4);
    this.tstates += 16;
  }

  ldir() {
    this.ldi();
    if (this.bc !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5; // 21 total
    }
  }

  ldd() {
    const val = this.mem.readByte(this.hl);
    this.mem.writeByte(this.de, val);
    this.hl = (this.hl - 1) & 0xffff;
    this.de = (this.de - 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    const n = (this.a + val) & 0xff;
    this.f = (this.f & (0x80 | 0x40 | 0x01)) | (this.bc !== 0 ? 0x04 : 0) | (n & 0x08) | ((n & 0x02) << 4);
    this.tstates += 16;
  }

  lddr() {
    this.ldd();
    if (this.bc !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  cpi() {
    const val = this.mem.readByte(this.hl);
    const diff = (this.a - val) & 0xff;
    this.hl = (this.hl + 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    let f = (this.f & 0x01) | (this.SZ[diff] & (0x80 | 0x40)) | 0x02; // N set
    if ((this.a & 0x0f) < (val & 0x0f)) f |= 0x10;
    if (this.bc !== 0) f |= 0x04;
    const n = (diff - ((f & 0x10) ? 1 : 0)) & 0xff;
    f |= (n & 0x08) | ((n & 0x02) << 4);
    this.f = f;
    this.tstates += 16;
  }

  cpir() {
    this.cpi();
    if (this.bc !== 0 && !(this.f & 0x40)) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  cpd() {
    const val = this.mem.readByte(this.hl);
    const diff = (this.a - val) & 0xff;
    this.hl = (this.hl - 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    let f = (this.f & 0x01) | (this.SZ[diff] & (0x80 | 0x40)) | 0x02;
    if ((this.a & 0x0f) < (val & 0x0f)) f |= 0x10;
    if (this.bc !== 0) f |= 0x04;
    const n = (diff - ((f & 0x10) ? 1 : 0)) & 0xff;
    f |= (n & 0x08) | ((n & 0x02) << 4);
    this.f = f;
    this.tstates += 16;
  }

  cpdr() {
    this.cpd();
    if (this.bc !== 0 && !(this.f & 0x40)) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  ini() {
    const val = this.mem.readPort(this.bc, 12);
    this.mem.writeByte(this.hl, val);
    this.hl = (this.hl + 1) & 0xffff;
    this.b = (this.b - 1) & 0xff;
    this.f = (this.b === 0 ? 0x40 : 0) | ((val & 0x80) ? 0x02 : 0);
    this.tstates += 16;
  }

  inir() {
    this.ini();
    if (this.b !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  ind() {
    const val = this.mem.readPort(this.bc, 12);
    this.mem.writeByte(this.hl, val);
    this.hl = (this.hl - 1) & 0xffff;
    this.b = (this.b - 1) & 0xff;
    this.f = (this.b === 0 ? 0x40 : 0) | ((val & 0x80) ? 0x02 : 0);
    this.tstates += 16;
  }

  indr() {
    this.ind();
    if (this.b !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  outi() {
    const val = this.mem.readByte(this.hl);
    this.mem.writePort(this.bc, val);
    this.hl = (this.hl + 1) & 0xffff;
    this.b = (this.b - 1) & 0xff;
    this.f = (this.b === 0 ? 0x40 : 0) | ((val & 0x80) ? 0x02 : 0);
    this.tstates += 16;
  }

  otir() {
    this.outi();
    if (this.b !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  outd() {
    const val = this.mem.readByte(this.hl);
    this.mem.writePort(this.bc, val);
    this.hl = (this.hl - 1) & 0xffff;
    this.b = (this.b - 1) & 0xff;
    this.f = (this.b === 0 ? 0x40 : 0) | ((val & 0x80) ? 0x02 : 0);
    this.tstates += 16;
  }

  otdr() {
    this.outd();
    if (this.b !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.tstates += 5;
    }
  }

  // Prefix DD (IX) / Prefix FD (IY)
  executeIndex(regName) {
    this.incR();
    const op = this.fetchByte();

    // Helper to get/set the 16-bit index reg
    const getIndex = () => this[regName];
    const setIndex = (v) => { this[regName] = v & 0xffff; };
    const getHigh = () => (this[regName] >> 8) & 0xff;
    const setHigh = (v) => { this[regName] = ((v & 0xff) << 8) | (this[regName] & 0xff); };
    const getLow = () => this[regName] & 0xff;
    const setLow = (v) => { this[regName] = (this[regName] & 0xff00) | (v & 0xff); };

    // Displaced address
    const getDispAddr = () => {
      const d = this.signedByte(this.fetchByte());
      return (getIndex() + d) & 0xffff;
    };

    switch (op) {
      // ADD IX/IY, rr
      case 0x09: setIndex(this.add16(getIndex(), this.bc)); this.tstates += 15; break;
      case 0x19: setIndex(this.add16(getIndex(), this.de)); this.tstates += 15; break;
      case 0x29: setIndex(this.add16(getIndex(), getIndex())); this.tstates += 15; break;
      case 0x39: setIndex(this.add16(getIndex(), this.sp)); this.tstates += 15; break;

      // LD IX/IY, nn
      case 0x21: setIndex(this.fetchWord()); this.tstates += 14; break;
      // LD (nn), IX/IY
      case 0x22: {
        const addr = this.fetchWord();
        const v = getIndex();
        this.mem.writeByte(addr, v & 0xff);
        this.mem.writeByte((addr + 1) & 0xffff, (v >> 8) & 0xff);
        this.tstates += 20;
        break;
      }
      // INC IX/IY
      case 0x23: setIndex(getIndex() + 1); this.tstates += 10; break;
      // INC IXh/IYh
      case 0x24: setHigh(this.inc8(getHigh())); this.tstates += 8; break;
      // DEC IXh/IYh
      case 0x25: setHigh(this.dec8(getHigh())); this.tstates += 8; break;
      // LD IXh/IYh, n
      case 0x26: setHigh(this.fetchByte()); this.tstates += 11; break;
      // LD IX/IY, (nn)
      case 0x2a: {
        const addr = this.fetchWord();
        setIndex(this.mem.readByte(addr) | (this.mem.readByte((addr + 1) & 0xffff) << 8));
        this.tstates += 20;
        break;
      }
      // DEC IX/IY
      case 0x2b: setIndex(getIndex() - 1); this.tstates += 10; break;
      // INC IXl/IYl
      case 0x2c: setLow(this.inc8(getLow())); this.tstates += 8; break;
      // DEC IXl/IYl
      case 0x2d: setLow(this.dec8(getLow())); this.tstates += 8; break;
      // LD IXl/IYl, n
      case 0x2e: setLow(this.fetchByte()); this.tstates += 11; break;

      // INC (IX+d)
      case 0x34: {
        const addr = getDispAddr();
        const val = this.inc8(this.mem.readByte(addr));
        this.mem.writeByte(addr, val);
        this.tstates += 23;
        break;
      }
      // DEC (IX+d)
      case 0x35: {
        const addr = getDispAddr();
        const val = this.dec8(this.mem.readByte(addr));
        this.mem.writeByte(addr, val);
        this.tstates += 23;
        break;
      }
      // LD (IX+d), n
      case 0x36: {
        const addr = getDispAddr();
        const n = this.fetchByte();
        this.mem.writeByte(addr, n);
        this.tstates += 19;
        break;
      }

      // LD r, IXh / IXl
      case 0x44: this.b = getHigh(); this.tstates += 8; break;
      case 0x45: this.b = getLow(); this.tstates += 8; break;
      case 0x46: this.b = this.mem.readByte(getDispAddr()); this.tstates += 19; break;
      case 0x4c: this.c = getHigh(); this.tstates += 8; break;
      case 0x4d: this.c = getLow(); this.tstates += 8; break;
      case 0x4e: this.c = this.mem.readByte(getDispAddr()); this.tstates += 19; break;
      case 0x54: this.d = getHigh(); this.tstates += 8; break;
      case 0x55: this.d = getLow(); this.tstates += 8; break;
      case 0x56: this.d = this.mem.readByte(getDispAddr()); this.tstates += 19; break;
      case 0x5c: this.e = getHigh(); this.tstates += 8; break;
      case 0x5d: this.e = getLow(); this.tstates += 8; break;
      case 0x5e: this.e = this.mem.readByte(getDispAddr()); this.tstates += 19; break;

      // LD IXh, r
      case 0x60: setHigh(this.b); this.tstates += 8; break;
      case 0x61: setHigh(this.c); this.tstates += 8; break;
      case 0x62: setHigh(this.d); this.tstates += 8; break;
      case 0x63: setHigh(this.e); this.tstates += 8; break;
      case 0x64: this.tstates += 8; break;
      case 0x65: setHigh(getLow()); this.tstates += 8; break;
      case 0x66: this.h = this.mem.readByte(getDispAddr()); this.tstates += 19; break;
      case 0x67: setHigh(this.a); this.tstates += 8; break;

      // LD IXl, r
      case 0x68: setLow(this.b); this.tstates += 8; break;
      case 0x69: setLow(this.c); this.tstates += 8; break;
      case 0x6a: setLow(this.d); this.tstates += 8; break;
      case 0x6b: setLow(this.e); this.tstates += 8; break;
      case 0x6c: setLow(getHigh()); this.tstates += 8; break;
      case 0x6d: this.tstates += 8; break;
      case 0x6e: this.l = this.mem.readByte(getDispAddr()); this.tstates += 19; break;
      case 0x6f: setLow(this.a); this.tstates += 8; break;

      // LD (IX+d), r
      case 0x70: this.mem.writeByte(getDispAddr(), this.b); this.tstates += 19; break;
      case 0x71: this.mem.writeByte(getDispAddr(), this.c); this.tstates += 19; break;
      case 0x72: this.mem.writeByte(getDispAddr(), this.d); this.tstates += 19; break;
      case 0x73: this.mem.writeByte(getDispAddr(), this.e); this.tstates += 19; break;
      case 0x74: this.mem.writeByte(getDispAddr(), this.h); this.tstates += 19; break;
      case 0x75: this.mem.writeByte(getDispAddr(), this.l); this.tstates += 19; break;
      case 0x77: this.mem.writeByte(getDispAddr(), this.a); this.tstates += 19; break;

      // LD A, (IX+d)
      case 0x7c: this.a = getHigh(); this.tstates += 8; break;
      case 0x7d: this.a = getLow(); this.tstates += 8; break;
      case 0x7e: this.a = this.mem.readByte(getDispAddr()); this.tstates += 19; break;

      // Arithmetic with (IX+d) / IXh / IXl
      case 0x84: this.add8(getHigh()); this.tstates += 8; break;
      case 0x85: this.add8(getLow()); this.tstates += 8; break;
      case 0x86: this.add8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0x8c: this.adc8(getHigh()); this.tstates += 8; break;
      case 0x8d: this.adc8(getLow()); this.tstates += 8; break;
      case 0x8e: this.adc8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0x94: this.sub8(getHigh()); this.tstates += 8; break;
      case 0x95: this.sub8(getLow()); this.tstates += 8; break;
      case 0x96: this.sub8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0x9c: this.sbc8(getHigh()); this.tstates += 8; break;
      case 0x9d: this.sbc8(getLow()); this.tstates += 8; break;
      case 0x9e: this.sbc8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0xa4: this.and8(getHigh()); this.tstates += 8; break;
      case 0xa5: this.and8(getLow()); this.tstates += 8; break;
      case 0xa6: this.and8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0xac: this.xor8(getHigh()); this.tstates += 8; break;
      case 0xad: this.xor8(getLow()); this.tstates += 8; break;
      case 0xae: this.xor8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0xb4: this.or8(getHigh()); this.tstates += 8; break;
      case 0xb5: this.or8(getLow()); this.tstates += 8; break;
      case 0xb6: this.or8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      case 0xbc: this.cp8(getHigh()); this.tstates += 8; break;
      case 0xbd: this.cp8(getLow()); this.tstates += 8; break;
      case 0xbe: this.cp8(this.mem.readByte(getDispAddr())); this.tstates += 19; break;

      // POP IX/IY
      case 0xe1: setIndex(this.popWord()); this.tstates += 14; break;
      // EX (SP), IX/IY
      case 0xe3: {
        const spl = this.mem.readByte(this.sp);
        const sph = this.mem.readByte((this.sp + 1) & 0xffff);
        const cur = getIndex();
        this.mem.writeByte(this.sp, cur & 0xff);
        this.mem.writeByte((this.sp + 1) & 0xffff, (cur >> 8) & 0xff);
        setIndex((sph << 8) | spl);
        this.tstates += 23;
        break;
      }
      // PUSH IX/IY
      case 0xe5: this.pushWord(getIndex()); this.tstates += 15; break;
      // JP (IX/IY)
      case 0xe9: this.pc = getIndex(); this.tstates += 8; break;
      // LD SP, IX/IY
      case 0xf9: this.sp = getIndex(); this.tstates += 10; break;

      // Prefix DDCB / FDCB
      case 0xcb: {
        const d = this.signedByte(this.fetchByte());
        const cbOp = this.fetchByte();
        const addr = (getIndex() + d) & 0xffff;
        this.executeIndexedCB(addr, cbOp);
        break;
      }

      default:
        // If not an index instruction, fall back to standard opcode
        this.executeOpcode(op);
        break;
    }
  }

  executeIndexedCB(addr, op) {
    const regIdx = op & 0x07;
    const bit = (op >> 3) & 0x07;
    const group = op >> 6;
    let val = this.mem.readByte(addr);

    if (group === 0) {
      // Shift / Rotate (IX+d)
      const shiftOp = (op >> 3) & 0x07;
      let c = 0;
      switch (shiftOp) {
        case 0: c = (val >> 7) & 1; val = ((val << 1) | c) & 0xff; break; // RLC
        case 1: c = val & 1; val = ((val >> 1) | (c << 7)) & 0xff; break; // RRC
        case 2: c = (val >> 7) & 1; val = ((val << 1) | (this.f & 1)) & 0xff; break; // RL
        case 3: c = val & 1; val = ((val >> 1) | ((this.f & 1) << 7)) & 0xff; break; // RR
        case 4: c = (val >> 7) & 1; val = (val << 1) & 0xff; break; // SLA
        case 5: c = val & 1; val = ((val >> 1) | (val & 0x80)) & 0xff; break; // SRA
        case 6: c = (val >> 7) & 1; val = ((val << 1) | 1) & 0xff; break; // SLL
        case 7: c = val & 1; val = (val >> 1) & 0xff; break; // SRL
      }
      this.f = this.SZP[val] | c;
      this.mem.writeByte(addr, val);
      if (regIdx !== 6) this.setRegByIndex(regIdx, val);
      this.tstates += 23;
    } else if (group === 1) {
      // BIT b, (IX+d)
      const bitVal = val & (1 << bit);
      let f = (this.f & 0x01) | 0x10 | ((addr >> 8) & (0x20 | 0x08));
      if (bitVal === 0) f |= 0x44;
      if (bit === 7 && bitVal) f |= 0x80;
      this.f = f;
      this.tstates += 20;
    } else if (group === 2) {
      // RES b, (IX+d)
      val &= ~(1 << bit);
      this.mem.writeByte(addr, val);
      if (regIdx !== 6) this.setRegByIndex(regIdx, val);
      this.tstates += 23;
    } else if (group === 3) {
      // SET b, (IX+d)
      val |= (1 << bit);
      this.mem.writeByte(addr, val);
      if (regIdx !== 6) this.setRegByIndex(regIdx, val);
      this.tstates += 23;
    }
  }
}
