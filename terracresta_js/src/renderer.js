/**
 * Terra Cresta - High-Performance Canvas 2D Pixel Renderer
 * Renders authentic Winger fighter ships, modular docked configurations, Phoenix flames,
 * tactical formation separation, swooping enemy waves, upgrade pods, and arcade HUD.
 */

import {
  SPRITE_WINGER, SPRITE_REGIO_2, SPRITE_GRUM_3, SPRITE_BETA_4, SPRITE_DELTA_5,
  SPRITE_CAPSULE_CLOSED, SPRITE_CAPSULE_OPEN, SPRITE_SWOOPER, SPRITE_SPINNER_A,
  SPRITE_SPINNER_B, SPRITE_TURRET, SPRITE_BOSS_MANDLER, PALETTE
} from './sprites.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
  }

  // Draw 2D pixel boolean matrix bitmap with exact color
  drawBitmap(bitmap, x, y, color, scale = 1) {
    if (!bitmap) return;
    this.ctx.fillStyle = color;
    const px = Math.floor(x);
    const py = Math.floor(y);

    for (let r = 0; r < bitmap.length; r++) {
      const row = bitmap[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c]) {
          this.ctx.fillRect(px + c * scale, py + r * scale, scale, scale);
        }
      }
    }
  }

  render(game) {
    const ctx = this.ctx;

    // 1. Draw Space & Island Terrain
    game.background.render(ctx);

    // 2. Draw Upgrade Capsule Silos (2, 3, 4, 5)
    for (const cap of game.enemyManager.capsules) {
      if (cap.y < -30 || cap.y > 250) continue;

      if (!cap.isOpen) {
        this.drawBitmap(SPRITE_CAPSULE_CLOSED, cap.x, cap.y, PALETTE.BRIGHT_CYAN);
        // Number tag
        ctx.fillStyle = PALETTE.BRIGHT_YELLOW;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`(${cap.module})`, cap.x + 3, cap.y + 13);
      } else if (!cap.isCollected) {
        this.drawBitmap(SPRITE_CAPSULE_OPEN, cap.x, cap.y, PALETTE.BRIGHT_BLUE);
        // Draw module hovering in silo
        this.drawModule(cap.module, cap.x + 2, cap.y + 3);
      }
    }

    // 3. Draw Enemies & Ground Turrets
    for (const e of game.enemyManager.enemies) {
      if (e.type === 'swoop') {
        this.drawBitmap(SPRITE_SWOOPER, e.x, e.y, e.color || PALETTE.BRIGHT_RED);
      } else if (e.type === 'spinner') {
        const sprite = e.frame < 1 ? SPRITE_SPINNER_A : SPRITE_SPINNER_B;
        this.drawBitmap(sprite, e.x, e.y, e.color || PALETTE.BRIGHT_CYAN);
      } else if (e.type === 'turret') {
        this.drawBitmap(SPRITE_TURRET, e.x, e.y, PALETTE.BRIGHT_YELLOW);
      } else if (e.type === 'bullet') {
        ctx.fillStyle = e.color || PALETTE.BRIGHT_RED;
        ctx.fillRect(Math.floor(e.x), Math.floor(e.y), e.width, e.height);
      }
    }

    // 4. Draw Mandler Core Boss
    if (game.enemyManager.boss) {
      const b = game.enemyManager.boss;
      this.drawBitmap(SPRITE_BOSS_MANDLER, b.x, b.y, PALETTE.BRIGHT_MAGENTA);

      // Flashing Core Heart
      ctx.fillStyle = (Math.floor(Date.now() / 70) % 2 === 0) ? PALETTE.BRIGHT_RED : PALETTE.BRIGHT_YELLOW;
      ctx.beginPath();
      ctx.arc(b.x + 18, b.y + 16, 6, 0, Math.PI * 2);
      ctx.fill();

      // Boss Health Bar
      ctx.fillStyle = '#222222';
      ctx.fillRect(b.x - 4, b.y - 8, 44, 4);
      ctx.fillStyle = PALETTE.BRIGHT_GREEN;
      ctx.fillRect(b.x - 4, b.y - 8, Math.max(0, (b.health / b.maxHealth) * 44), 4);
    }

    // 5. Draw Player Laser Cannons & Plasma
    for (const b of game.player.bullets) {
      if (b.type === 'phoenix') {
        ctx.fillStyle = (Math.floor(Date.now() / 50) % 2 === 0) ? PALETTE.BRIGHT_YELLOW : PALETTE.ORANGE;
        ctx.fillRect(Math.floor(b.x - 3), Math.floor(b.y), 7, 10);
      } else if (b.type === 'plasma') {
        ctx.fillStyle = PALETTE.BRIGHT_CYAN;
        ctx.fillRect(Math.floor(b.x - 1), Math.floor(b.y), 3, 12);
      } else if (b.type === 'heavy') {
        ctx.fillStyle = PALETTE.BRIGHT_YELLOW;
        ctx.fillRect(Math.floor(b.x), Math.floor(b.y), 3, 8);
      } else {
        ctx.fillStyle = PALETTE.BRIGHT_WHITE;
        ctx.fillRect(Math.floor(b.x), Math.floor(b.y), 2, 7);
      }
    }

    // 6. Draw Player Winger Fighter & Modular Docking
    if (game.player.alive) {
      // Invulnerability blink
      if (game.player.invulnerableTimer <= 0 || Math.floor(game.player.invulnerableTimer / 4) % 2 === 0) {
        if (game.player.isPhoenix) {
          this.drawPhoenix(game.player.x, game.player.y);
        } else if (game.player.isSplit) {
          // Separated Diamond Formation
          const positions = game.player.getModulePositions();
          for (const p of positions) {
            this.drawModule(p.module, p.x, p.y);
          }

          // Tactical Energy Beams connecting the modules
          ctx.strokeStyle = (Math.floor(Date.now() / 60) % 2 === 0) ? PALETTE.BRIGHT_CYAN : PALETTE.BRIGHT_YELLOW;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          for (let i = 0; i < positions.length; i++) {
            const p1 = positions[i];
            const p2 = positions[(i + 1) % positions.length];
            ctx.moveTo(p1.x + 8, p1.y + 8);
            ctx.lineTo(p2.x + 8, p2.y + 8);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Assembled Multi-Part Fighter
          this.drawAssembledShip(game.player);
        }
      }
    }

    // 7. Explosions & Particle Bursts
    for (const p of game.enemyManager.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
    }

    // 8. Arcade HUD (Score, High Score, Ships, Formations)
    this.renderHUD(game);
  }

  drawModule(num, x, y) {
    switch (num) {
      case 1: this.drawBitmap(SPRITE_WINGER, x, y, PALETTE.BRIGHT_WHITE); break;
      case 2: this.drawBitmap(SPRITE_REGIO_2, x, y, PALETTE.BRIGHT_YELLOW); break;
      case 3: this.drawBitmap(SPRITE_GRUM_3, x, y, PALETTE.BRIGHT_CYAN); break;
      case 4: this.drawBitmap(SPRITE_BETA_4, x, y, PALETTE.BRIGHT_GREEN); break;
      case 5: this.drawBitmap(SPRITE_DELTA_5, x, y, PALETTE.BRIGHT_RED); break;
    }
  }

  drawAssembledShip(player) {
    const x = player.x;
    const y = player.y;

    // Layer attached modules
    if (player.modules.includes(5)) this.drawBitmap(SPRITE_DELTA_5, x, y + 4, PALETTE.BRIGHT_RED);
    if (player.modules.includes(4)) this.drawBitmap(SPRITE_BETA_4, x, y - 2, PALETTE.BRIGHT_GREEN);
    if (player.modules.includes(3)) this.drawBitmap(SPRITE_GRUM_3, x, y + 6, PALETTE.BRIGHT_CYAN);
    if (player.modules.includes(2)) this.drawBitmap(SPRITE_REGIO_2, x, y - 4, PALETTE.BRIGHT_YELLOW);

    // Main Cockpit Fighter
    this.drawBitmap(SPRITE_WINGER, x, y, PALETTE.BRIGHT_WHITE);
  }

  drawPhoenix(x, y) {
    const ctx = this.ctx;
    const colors = [PALETTE.BRIGHT_YELLOW, PALETTE.ORANGE, PALETTE.FLAME];
    const color = colors[Math.floor(Date.now() / 60) % colors.length];

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 10);
    ctx.lineTo(x + 28, y + 10);
    ctx.lineTo(x + 18, y + 26);
    ctx.lineTo(x + 8, y + 20);
    ctx.lineTo(x - 2, y + 26);
    ctx.lineTo(x - 12, y + 10);
    ctx.closePath();
    ctx.fill();

    this.drawBitmap(SPRITE_WINGER, x, y, PALETTE.BRIGHT_WHITE);
  }

  renderHUD(game) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.BRIGHT_YELLOW;
    ctx.font = '10px monospace';

    // 1UP, HIGH SCORE
    ctx.fillText(`1UP: ${String(game.player.score).padStart(6, '0')}`, 10, 14);
    ctx.fillText(`HIGH: ${String(game.highScore).padStart(6, '0')}`, 155, 14);

    // Bottom Status
    ctx.fillStyle = PALETTE.BRIGHT_WHITE;
    ctx.fillText(`SHIPS: ${'▲ '.repeat(Math.max(0, game.player.lives))}`, 10, 234);

    if (game.player.isPhoenix) {
      ctx.fillStyle = PALETTE.ORANGE;
      ctx.fillText(`🔥 PHOENIX (${Math.ceil(game.player.phoenixTimer / 60)}s)`, 130, 234);
    } else if (game.player.isSplit) {
      ctx.fillStyle = PALETTE.BRIGHT_CYAN;
      ctx.fillText(`⚡ SPLIT (${Math.ceil(game.player.splitTimer / 60)}s)`, 140, 234);
    } else if (game.player.modules.length > 1) {
      ctx.fillStyle = PALETTE.BRIGHT_GREEN;
      ctx.fillText(`MODS: [${game.player.modules.join('-')}] (SHIFT: SPLIT)`, 80, 234);
    }
  }
}
