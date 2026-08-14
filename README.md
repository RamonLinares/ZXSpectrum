# 🕹️ Sinclair ZX Spectrum 48K Web Emulator

A high-performance, cycle-accurate **Sinclair ZX Spectrum 48K** emulator built from scratch in Vanilla JavaScript, HTML5 Canvas, and the Web Audio API.

Features cycle-accurate Z80 CPU emulation, authentic ULA video rendering (with 320x240 display including borders and flash attributes), 48K ULA floating bus emulation, pure 1-bit port `0xFE` beeper audio synthesis, an interactive virtual Sinclair rubber keyboard, instant ROM LD-BYTES tape deck for `.TAP` files, and full Kempston, Sinclair Interface 2, and Cursor joystick support.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+ recommended) or any static HTTP web server (Python `http.server`, Live Server, Nginx, Caddy, etc.).

### 2. Run the Emulator
```bash
# Clone the repository
git clone https://github.com/RamonLinares/ZXSpectrum.git
cd ZXSpectrum

# Start the local development server
npm start
# Or run with Node directly: node server.js
```
Open your browser and navigate to: **`http://localhost:8080`**

---

## 💾 Required Files & Where to Download Them

To comply with copyright guidelines, **no proprietary Sinclair ROMs or commercial game binaries are bundled in this repository**.

### 1. Sinclair 48K Operating System ROM (`48k.rom`)
To boot into the authentic Sinclair BASIC (1982) environment and load tape games via the Sinclair ROM loader, you need the **16,384-byte (16KB) ZX Spectrum 48K ROM**.

* **File Name:** `48k.rom`
* **File Size:** Exactly `16,384 bytes` (`0x4000` bytes)
* **Expected MD5 Checksum:** `d183955da1342278db47682420947d5d`

#### Where to Download `48k.rom`:
* **[World of Spectrum - Official ROMs](https://worldofspectrum.net/sinclair-roms/)** *(Amstrad granted permission for non-commercial distribution of Sinclair Spectrum ROMs)*
* **[Fuse Emulator Spectrum ROMs Collection](https://sourceforge.net/projects/fuse-emulator/)** (Extract `48.rom` or `48k.rom` from the Fuse distribution)
* **[TOSEC / Internet Archive Sinclair ZX Spectrum ROM Archive](https://archive.org/details/tosec-sinclair-zx-spectrum)**

#### How to Load the ROM:
* **Option A (Recommended):** Place the downloaded `48k.rom` file directly inside the root folder of this project (`ZXSpectrum/48k.rom`). The web app will automatically detect and load it on startup.
* **Option B (Drag & Drop):** Simply drag-and-drop your `48k.rom` file anywhere onto the browser canvas or click the file picker in the **Tape Deck / File Loader** drawer.

---

### 2. Games, Software & Demos (`.TAP`, `.SNA`, `.Z80`)

The emulator supports standard `.TAP` tape files, `.SNA` snapshots (49,179 bytes), `.Z80` snapshots, and `.SCR` screen dumps.

#### Where to Download ZX Spectrum Software:
* **[World of Spectrum Software Archive](https://worldofspectrum.net/games/)**: Over 25,000 classic Spectrum games, utilities, and demos.
* **[Spectrum Computing](https://spectrumcomputing.co.uk/)**: Comprehensive ZX Spectrum database with game downloads, reviews, tape scans, and manuals.
* **[Planet Sinclair](https://rk.nvg.ntnu.no/sinclair/software/software.htm)**: Retro Sinclair software repository.
* **[Itch.io ZX Spectrum Games](https://itch.io/games/tag-zx-spectrum)**: Modern homebrew and indie ZX Spectrum games released by active demoscene and retro developers.

#### How to Play Games:
1. **Drag and drop** any `.tap`, `.sna`, or `.z80` file onto the emulator screen.
2. For `.TAP` tape files (e.g. *Terra Cresta*, *Uridium*, *Manic Miner*, *Target Renegade*):
   - The emulator automatically types `LOAD ""` and uses high-speed ROM LD-BYTES interception (`0x0556`/`0x0562`) to load multi-block games in under 1 second.
   - Use the **Tape Deck** drawer on top to inspect block headers, rewind tapes, or monitor loading progress.

---

## 🎮 Controls & Joystick Emulation

The emulator includes built-in simultaneous support for both keyboard matrix scanning and Kempston joystick reading:

| Action | Physical Keyboard Key | Kempston Joystick (Port 0x1F) | Sinclair Interface 2 / Cursor |
| :--- | :--- | :--- | :--- |
| **Move Up** | `Arrow Up` / `Q` / `Numpad 8` | Bit 3 (`Value 8`) | `9` (Sinclair 1) / `7` (Cursor) |
| **Move Down** | `Arrow Down` / `A` / `Numpad 2` | Bit 2 (`Value 4`) | `8` (Sinclair 1) / `6` (Cursor) |
| **Move Left** | `Arrow Left` / `O` / `Numpad 4` | Bit 1 (`Value 2`) | `6` (Sinclair 1) / `5` (Cursor) |
| **Move Right** | `Arrow Right` / `P` / `Numpad 6` | Bit 0 (`Value 1`) | `7` (Sinclair 1) / `8` (Cursor) |
| **Fire / Action** | `Space` / `Enter` / `Z` / `X` | Bit 4 (`Value 16`) | `0` (Sinclair 1 / Cursor) |
| **Break / Stop** | `Space` + `Caps Shift` (`ShiftLeft`) | — | — |
| **Symbol Shift** | `Ctrl` / `Alt` / `ShiftRight` | — | — |

---

## ⌨️ Features & Highlights

* **Cycle-Accurate Z80 Core**: All documented opcodes, prefix tables (`CB`, `DD`, `ED`, `FD`, `DDCB`, `FDCB`), flag parity tables (`SZ53P`), 16-bit block instructions (`LDIR`, `CPIR`, `INIR`, `OTIR`), and Interrupt Modes (`IM 0`, `IM 1`, `IM 2`).
* **48K ULA Display Engine**: Standard 256×192 pixel resolution with 32×24 attribute color cells (8 normal + 8 bright colors), full 320×240 border rendering, flashing attributes, and CRT scanline filter.
* **48K ULA Floating Bus**: Sub-scanline floating bus emulation matching authentic ULA memory fetch cycles at port reads.
* **Instant Tape Deck (ROM LD-BYTES Interceptor)**: Instantaneous loading for multi-block `.TAP` files with block-by-block inspection, manual rewind, and automatic BASIC command injection.
* **Integrated Z80 Debugger**: Interactive disassembler, live register editor (`AF`, `BC`, `DE`, `HL`, `IX`, `IY`, `SP`, `PC`), memory hex viewer, and instruction stepper.
* **Audio Engine**: 1-bit port `0xFE` speaker DAC with dynamic sample synthesis at 44.1 kHz.
* **Quick Save / Load**: 3 save-state slots stored in browser `localStorage` (`F5` quick save, `F9` quick load) + `.SNA` snapshot exporter.

---

## 🧪 Running Automated Tests

A 63-test verification suite tests CPU opcodes, 16-bit arithmetic, interrupts, floating-bus timing, Kempston and Sinclair joystick modes, TAP parsing, and save states:

```bash
npm test
```

---

## 📜 License

This emulator codebase is licensed under the [MIT License](LICENSE).

*Sinclair ZX Spectrum is a trademark of Amstrad / Sky Group. ZX Spectrum ROM copyright belongs to Amstrad (who permitted non-commercial distribution).*
