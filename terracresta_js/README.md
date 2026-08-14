# 🚀 Terra Cresta (1986) - Standalone Native JavaScript Recreation

This is a standalone, native JavaScript recreation of the classic arcade hit **Terra Cresta** (Nichibutsu / Imagine 1986).

It runs directly in modern web browsers via standard **HTML5 Canvas 2D** and the **Web Audio API** at 60 FPS without requiring Z80 CPU emulation or ZX Spectrum ROMs.

---

## 🌟 Key Features

1. **Modular Ship Combination System**:
   - **(1) Winger**: Main cockpit fighter with dual forward laser cannons.
   - **(2) Regio**: Wide forward twin heavy cannons.
   - **(3) Grum**: Rear defense cannon.
   - **(4) Beta**: Energy barrier and penetrating plasma beam.
   - **(5) Delta**: Angled homing spread lasers.
   - **🔥 Phoenix Transformation**: Assembling all 5 modules turns the ship into an invincible flaming bird with massive fire spreads!
   - **⚡ Tactical Formation Split**: Press `Shift` or `X` to split attached modules into a wide diamond formation with connecting energy beams.

2. **Chiptune Audio Synthesizer**:
   - Web Audio API synthesizer recreating Martin Galway's iconic musical theme and sound effects (pew-pew lasers, explosions, docking jingles, Phoenix roars).

3. **Multi-Input Support**:
   - **Keyboard**: Arrow Keys / WASD / Q-A-O-P + Space (Fire) + Shift (Split Formation).
   - **Touch Screen**: Virtual D-Pad and Action buttons for mobile devices.
   - **Gamepad**: Supports standard USB & Bluetooth controllers.

---

## 🕹️ Running the Game Locally

1. Start any local web server in the repository root:
   ```bash
   npx serve .
   # OR
   python3 -m http.server 8080
   ```
2. Open in your browser:
   ```
   http://localhost:8080/terracresta_js/
   ```
