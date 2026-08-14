/**
 * Terra Cresta - Enemy Waves, AI Paths, and Capsule Silos
 * Emulates authentic swooping insectoids, rolling space pods, ground turrets, and upgrade silos.
 */

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.capsules = [];
    this.particles = [];
    this.boss = null;
    this.waveTimer = 0;
    this.waveIndex = 0;
  }

  reset() {
    this.enemies = [];
    this.capsules = [];
    this.particles = [];
    this.boss = null;
    this.waveTimer = 0;
    this.waveIndex = 0;

    // Spawn initial capsules along the map
    this.spawnCapsule(2, 60, -300);
    this.spawnCapsule(3, 180, -900);
    this.spawnCapsule(4, 90, -1600);
    this.spawnCapsule(5, 140, -2400);
  }

  spawnCapsule(moduleNum, x, y) {
    this.capsules.push({
      module: moduleNum,
      x: x,
      y: y,
      width: 24,
      height: 24,
      health: 8,
      isOpen: false,
      isCollected: false
    });
  }

  spawnSwoopWave(startX, side = 1) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      this.enemies.push({
        type: 'swoop',
        x: startX,
        y: -20 - i * 28,
        width: 16,
        height: 16,
        vx: side * 1.8,
        vy: 2.2,
        health: 1,
        scoreValue: 100,
        age: -i * 12,
        initialX: startX,
        side: side,
        color: '#ff0055'
      });
    }
  }

  spawnSpinnerWave(startX) {
    const count = 4;
    for (let i = 0; i < count; i++) {
      this.enemies.push({
        type: 'spinner',
        x: startX + (i % 2 === 0 ? -24 : 24),
        y: -30 - i * 36,
        width: 16,
        height: 16,
        vx: 0,
        vy: 1.6,
        health: 2,
        scoreValue: 200,
        age: 0,
        frame: 0,
        color: '#00ffff'
      });
    }
  }

  spawnTurret(x, y) {
    this.enemies.push({
      type: 'turret',
      x: x,
      y: y,
      width: 16,
      height: 16,
      vx: 0,
      vy: 0, // Moves with terrain scroll
      health: 3,
      scoreValue: 300,
      cooldown: 90 + Math.random() * 60,
      color: '#ffff00'
    });
  }

  spawnBoss() {
    this.boss = {
      x: 104,
      y: -60,
      width: 48,
      height: 48,
      vx: 1.2,
      vy: 0.8,
      health: 60,
      maxHealth: 60,
      phase: 'enter', // 'enter', 'attack', 'laser'
      timer: 0,
      coreOpen: true,
      scoreValue: 5000,
      bullets: []
    };
  }

  addExplosion(x, y, count = 12, color = '#ff5500') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.5;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: color
      });
    }
  }

  update(scrollSpeed) {
    this.waveTimer++;

    // Wave spawning intervals
    if (!this.boss) {
      if (this.waveTimer % 240 === 60) {
        this.spawnSwoopWave(40, 1);
      } else if (this.waveTimer % 240 === 180) {
        this.spawnSwoopWave(216, -1);
      } else if (this.waveTimer % 360 === 120) {
        this.spawnSpinnerWave(128);
      } else if (this.waveTimer % 300 === 0) {
        this.spawnTurret(60 + Math.random() * 136, -20);
      }

      // Trigger Boss at waveTimer = 2200 (~36 seconds)
      if (this.waveTimer >= 2200 && !this.boss) {
        this.spawnBoss();
      }
    }

    // 1. Update Capsules
    for (const cap of this.capsules) {
      cap.y += scrollSpeed;

      // Check bullet hits on closed capsule
      if (!cap.isOpen) {
        for (let i = this.game.player.bullets.length - 1; i >= 0; i--) {
          const b = this.game.player.bullets[i];
          if (b.x >= cap.x && b.x <= cap.x + cap.width && b.y >= cap.y && b.y <= cap.y + cap.height) {
            this.game.player.bullets.splice(i, 1);
            cap.health -= b.power || 1;
            this.addExplosion(b.x, b.y, 4, '#ffff00');

            if (cap.health <= 0) {
              cap.isOpen = true;
              this.game.audio.playExplosion(false);
              this.addExplosion(cap.x + 12, cap.y + 12, 16, '#00ffff');
            }
          }
        }
      } else if (!cap.isCollected) {
        // Check player collection
        const p = this.game.player;
        if (p.alive && Math.abs((p.x + 8) - (cap.x + 12)) < 16 && Math.abs((p.y + 8) - (cap.y + 12)) < 16) {
          cap.isCollected = true;
          p.attachModule(cap.module);
          this.game.addScore(1000);
          this.addExplosion(cap.x + 12, cap.y + 12, 20, '#ffffff');
        }
      }
    }

    // 2. Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.age++;

      if (e.type === 'swoop') {
        // Swoop sine-wave path
        e.y += e.vy;
        e.x = e.initialX + Math.sin(e.age * 0.06) * 60 * e.side;
      } else if (e.type === 'spinner') {
        e.y += e.vy;
        e.x += Math.sin(e.age * 0.1) * 1.5;
        e.frame = (e.frame + 0.15) % 2;
      } else if (e.type === 'turret') {
        e.y += scrollSpeed;
        e.cooldown--;
        if (e.cooldown <= 0 && e.y > 20 && e.y < 200) {
          e.cooldown = 120;
          // Aim at player
          const p = this.game.player;
          const angle = Math.atan2((p.y + 8) - (e.y + 8), (p.x + 8) - (e.x + 8));
          this.enemies.push({
            type: 'bullet',
            x: e.x + 8,
            y: e.y + 8,
            width: 4,
            height: 4,
            vx: Math.cos(angle) * 3.0,
            vy: Math.sin(angle) * 3.0,
            health: 1,
            color: '#ff3300'
          });
        }
      } else if (e.type === 'bullet') {
        e.x += e.vx;
        e.y += e.vy;
      }

      // Check collision with player bullets
      if (e.type !== 'bullet') {
        for (let bIdx = this.game.player.bullets.length - 1; bIdx >= 0; bIdx--) {
          const b = this.game.player.bullets[bIdx];
          if (b.x >= e.x && b.x <= e.x + e.width && b.y >= e.y && b.y <= e.y + e.height) {
            this.game.player.bullets.splice(bIdx, 1);
            e.health -= b.power || 1;
            this.addExplosion(b.x, b.y, 4, '#ffff00');

            if (e.health <= 0) {
              this.enemies.splice(i, 1);
              this.game.addScore(e.scoreValue || 100);
              this.game.audio.playExplosion(false);
              this.addExplosion(e.x + e.width / 2, e.y + e.height / 2, 14, e.color || '#ff0055');
              break;
            }
          }
        }
      }

      // Check collision with Player
      const p = this.game.player;
      if (p.alive && p.invulnerableTimer <= 0 && !p.isPhoenix) {
        if (p.x + 4 < e.x + e.width && p.x + p.width - 4 > e.x &&
            p.y + 4 < e.y + e.height && p.y + p.height - 4 > e.y) {
          this.game.playerHit();
        }
      }

      // Despawn offscreen
      if (e.y > 260 || e.y < -120 || e.x < -30 || e.x > 286) {
        this.enemies.splice(i, 1);
      }
    }

    // 3. Update Boss
    if (this.boss) {
      const b = this.boss;
      b.timer++;

      if (b.phase === 'enter') {
        b.y += b.vy;
        if (b.y >= 30) {
          b.phase = 'attack';
        }
      } else if (b.phase === 'attack') {
        b.x += b.vx;
        if (b.x <= 20 || b.x >= 188) {
          b.vx *= -1;
        }

        // Fire rotating spread shots
        if (b.timer % 45 === 0) {
          const angles = [-0.6, -0.3, 0, 0.3, 0.6];
          for (const a of angles) {
            this.enemies.push({
              type: 'bullet',
              x: b.x + 24,
              y: b.y + 36,
              width: 5,
              height: 5,
              vx: Math.sin(a) * 3.2,
              vy: Math.cos(a) * 3.2,
              health: 1,
              color: '#ff00ff'
            });
          }
        }
      }

      // Check player bullets hit boss core
      for (let i = this.game.player.bullets.length - 1; i >= 0; i--) {
        const bullet = this.game.player.bullets[i];
        if (bullet.x >= b.x && bullet.x <= b.x + b.width && bullet.y >= b.y && bullet.y <= b.y + b.height) {
          this.game.player.bullets.splice(i, 1);
          b.health -= bullet.power || 1;
          this.addExplosion(bullet.x, bullet.y, 6, '#ff00ff');

          if (b.health <= 0) {
            this.game.addScore(b.scoreValue);
            this.game.audio.playExplosion(true);
            this.addExplosion(b.x + 24, b.y + 24, 48, '#ffff00');
            this.boss = null;
            this.game.onBossDefeated();
            break;
          }
        }
      }
    }

    // 4. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
}
