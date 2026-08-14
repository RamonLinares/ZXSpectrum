/**
 * Terra Cresta - Player Ship & Modular Combination System
 * Manages Winger fighter physics, shooting tiers (#1..#5), Formation Split, and Phoenix Mode.
 */

export class Player {
  constructor(game) {
    this.game = game;
    this.x = 128;
    this.y = 190;
    this.width = 16;
    this.height = 16;
    this.speed = 2.5;

    // Modular Upgrades: [1: Winger, 2: Regio, 3: Grum, 4: Beta, 5: Delta]
    this.modules = [1];
    this.isPhoenix = false;
    this.phoenixTimer = 0;

    // Formation Split (when modules are separated into attack wings)
    this.isSplit = false;
    this.splitTimer = 0;
    this.splitDuration = 12 * 60; // 12 seconds in frames

    // Weapons & Cooldowns
    this.fireCooldown = 0;
    this.bullets = [];

    // State & Lives
    this.alive = true;
    this.invulnerableTimer = 120; // 2 seconds on spawn
    this.lives = 3;
    this.score = 0;
  }

  reset(full = false) {
    this.x = 128;
    this.y = 190;
    this.alive = true;
    this.invulnerableTimer = 120;
    this.isSplit = false;
    this.splitTimer = 0;
    this.isPhoenix = false;
    this.phoenixTimer = 0;
    this.bullets = [];

    if (full) {
      this.modules = [1];
      this.lives = 3;
      this.score = 0;
    } else {
      // Keep only module 1 on life loss
      this.modules = [1];
    }
  }

  attachModule(num) {
    if (!this.modules.includes(num)) {
      this.modules.push(num);
      this.modules.sort((a, b) => a - b);
      this.game.audio.playDockingJingle();

      // Check if all 5 modules assembled -> Activate Phoenix Mode!
      if (this.modules.length === 5) {
        this.activatePhoenix();
      }
    }
  }

  activatePhoenix() {
    this.isPhoenix = true;
    this.phoenixTimer = 15 * 60; // 15 seconds invulnerable flaming bird
    this.game.audio.playPhoenixRoar();
  }

  toggleFormationSplit() {
    if (this.modules.length <= 1 || this.isPhoenix) return;

    this.isSplit = !this.isSplit;
    if (this.isSplit) {
      this.splitTimer = this.splitDuration;
      this.game.audio.playFormationSplit();
    } else {
      this.splitTimer = 0;
    }
  }

  update(input) {
    if (!this.alive) return;

    // 1. Invulnerability countdown
    if (this.invulnerableTimer > 0) this.invulnerableTimer--;

    // 2. Phoenix timer countdown
    if (this.isPhoenix) {
      this.phoenixTimer--;
      if (this.phoenixTimer <= 0) {
        this.isPhoenix = false;
      }
    }

    // 3. Formation split timer countdown
    if (this.isSplit) {
      this.splitTimer--;
      if (this.splitTimer <= 0) {
        this.isSplit = false;
      }
    }

    // 4. Movement handling
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= this.speed;
    if (input.right) dx += this.speed;
    if (input.up) dy -= this.speed;
    if (input.down) dy += this.speed;

    // Diagonal speed normalization
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    this.x = Math.max(8, Math.min(240, this.x + dx));
    this.y = Math.max(16, Math.min(216, this.y + dy));

    // 5. Fire Handling
    if (this.fireCooldown > 0) this.fireCooldown--;

    if (input.fire && this.fireCooldown <= 0) {
      this.shoot();
      this.fireCooldown = 7; // Rapid-fire interval (7 frames ~8.5 shots/sec)
    }

    // 6. Secondary Action (Split Formation toggle)
    if (input.secondaryFirePressed) {
      this.toggleFormationSplit();
    }

    // 7. Update active player bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;
      b.y += b.vy;

      // Despawn off-screen bullets
      if (b.y < -10 || b.y > 250 || b.x < -10 || b.x > 266) {
        this.bullets.splice(i, 1);
      }
    }
  }

  shoot() {
    this.game.audio.playLaser(this.modules.length);

    if (this.isPhoenix) {
      // Phoenix 3-Way Massive Flaming Spread
      this.bullets.push({ x: this.x + 8, y: this.y, vx: 0, vy: -7, type: 'phoenix', power: 4 });
      this.bullets.push({ x: this.x + 2, y: this.y + 4, vx: -2, vy: -6.5, type: 'phoenix', power: 3 });
      this.bullets.push({ x: this.x + 14, y: this.y + 4, vx: 2, vy: -6.5, type: 'phoenix', power: 3 });
      return;
    }

    if (this.isSplit) {
      // Formation Split: Diamond crossfire + energy barrier beams
      const positions = this.getModulePositions();
      for (const pos of positions) {
        this.bullets.push({ x: pos.x + 8, y: pos.y, vx: 0, vy: -6.5, type: 'split_laser', power: 2 });
      }
      return;
    }

    // Standard Stacked Module Upgrades:
    // Module 1 (Winger): Dual forward cannon
    this.bullets.push({ x: this.x + 4, y: this.y, vx: 0, vy: -6, type: 'laser', power: 1 });
    this.bullets.push({ x: this.x + 12, y: this.y, vx: 0, vy: -6, type: 'laser', power: 1 });

    // Module 2 (Regio): Wide forward twin cannons
    if (this.modules.includes(2)) {
      this.bullets.push({ x: this.x - 2, y: this.y + 4, vx: 0, vy: -6.2, type: 'heavy', power: 2 });
      this.bullets.push({ x: this.x + 18, y: this.y + 4, vx: 0, vy: -6.2, type: 'heavy', power: 2 });
    }

    // Module 3 (Grum): Rear defense cannon
    if (this.modules.includes(3)) {
      this.bullets.push({ x: this.x + 8, y: this.y + 16, vx: 0, vy: 5, type: 'rear', power: 1 });
    }

    // Module 4 (Beta): Penetrating plasma beam
    if (this.modules.includes(4)) {
      this.bullets.push({ x: this.x + 8, y: this.y - 4, vx: 0, vy: -7, type: 'plasma', power: 3 });
    }

    // Module 5 (Delta): Angled homing spread lasers
    if (this.modules.includes(5)) {
      this.bullets.push({ x: this.x, y: this.y + 8, vx: -2.5, vy: -5, type: 'spread', power: 2 });
      this.bullets.push({ x: this.x + 16, y: this.y + 8, vx: 2.5, vy: -5, type: 'spread', power: 2 });
    }
  }

  getModulePositions() {
    if (!this.isSplit) {
      return [{ module: 1, x: this.x, y: this.y }];
    }

    // Diamond spread formation offsets
    const offsets = {
      1: { dx: 0, dy: 0 },
      2: { dx: -24, dy: -16 },
      3: { dx: 24, dy: -16 },
      4: { dx: -32, dy: 16 },
      5: { dx: 32, dy: 16 }
    };

    return this.modules.map(m => ({
      module: m,
      x: this.x + (offsets[m]?.dx || 0),
      y: this.y + (offsets[m]?.dy || 0)
    }));
  }
}
