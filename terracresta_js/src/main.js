/**
 * Terra Cresta - Main Game Controller & State Machine
 * Runs standalone at 60 FPS in native JavaScript.
 */

import { Renderer } from './renderer.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { Background } from './background.js';
import { TerraAudio } from './audio.js';
import { InputHandler } from './input.js';

export class TerraCrestaGame {
  constructor() {
    this.canvas = document.getElementById('terracresta-canvas');
    this.renderer = new Renderer(this.canvas);
    this.audio = new TerraAudio();
    this.input = new InputHandler();
    this.background = new Background();
    this.player = new Player(this);
    this.enemyManager = new EnemyManager(this);

    // States: 'TITLE', 'WINGER_READY', 'PLAYING', 'GAME_OVER', 'VICTORY'
    this.state = 'TITLE';
    this.stateTimer = 0;
    this.highScore = parseInt(localStorage.getItem('tc_highscore') || '20000', 10);
    this.scrollSpeed = 1.0;

    this.initUI();
    this.startLoop();
  }

  initUI() {
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startGame());
    }

    const muteBtn = document.getElementById('btn-tc-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.audio.setMuted(!this.audio.muted);
        muteBtn.textContent = this.audio.muted ? '🔇 Sound OFF' : '🔊 Sound ON';
      });
    }

    // Click canvas to resume audio
    this.canvas.addEventListener('click', () => {
      this.audio.init();
      this.audio.resume();
    });
  }

  startGame() {
    this.audio.init();
    this.audio.resume();
    this.player.reset(true);
    this.enemyManager.reset();
    this.state = 'WINGER_READY';
    this.stateTimer = 180; // 3 seconds on launch pad
    this.audio.startMusic();
  }

  addScore(pts) {
    this.player.score += pts;
    if (this.player.score > this.highScore) {
      this.highScore = this.player.score;
      localStorage.setItem('tc_highscore', this.highScore);
    }
  }

  playerHit() {
    this.audio.playExplosion(true);
    this.enemyManager.addExplosion(this.player.x + 8, this.player.y + 8, 32, '#ff3300');

    this.player.lives--;
    if (this.player.lives < 0) {
      this.state = 'GAME_OVER';
      this.stateTimer = 240;
    } else {
      this.player.reset(false); // Lose attached modules, keep 1UP
    }
  }

  onBossDefeated() {
    this.state = 'VICTORY';
    this.stateTimer = 300;
  }

  startLoop() {
    let lastTime = performance.now();
    const targetFps = 60;
    const interval = 1000 / targetFps;

    const loop = (currentTime) => {
      const delta = currentTime - lastTime;
      if (delta >= interval) {
        lastTime = currentTime - (delta % interval);
        this.update();
        this.render();
      }
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  update() {
    this.stateTimer++;

    if (this.state === 'TITLE') {
      this.background.update(0.4);
      if (this.input.start) {
        this.startGame();
      }
    } else if (this.state === 'WINGER_READY') {
      this.background.update(0.6);
      if (this.stateTimer > 90 && (this.input.fire || this.input.start)) {
        this.state = 'PLAYING';
      }
    } else if (this.state === 'PLAYING') {
      this.background.update(this.scrollSpeed);
      this.player.update(this.input);
      this.enemyManager.update(this.scrollSpeed);
    } else if (this.state === 'GAME_OVER' || this.state === 'VICTORY') {
      this.background.update(0.3);
      if (this.stateTimer > 120 && (this.input.fire || this.input.start)) {
        this.state = 'TITLE';
      }
    }

    this.input.postUpdate();
  }

  render() {
    if (this.state === 'TITLE') {
      this.renderTitleScreen();
    } else if (this.state === 'WINGER_READY') {
      this.renderer.render(this);
      this.renderWingerReady();
    } else if (this.state === 'PLAYING') {
      this.renderer.render(this);
    } else if (this.state === 'GAME_OVER') {
      this.renderer.render(this);
      this.renderGameOver();
    } else if (this.state === 'VICTORY') {
      this.renderer.render(this);
      this.renderVictory();
    }
  }

  renderTitleScreen() {
    const ctx = this.renderer.ctx;
    this.background.render(ctx);

    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TERRA CRESTA', 128, 60);

    ctx.fillStyle = '#ffff00';
    ctx.font = '10px monospace';
    ctx.fillText('NICHIBUTSU / IMAGINE 1986', 128, 85);
    ctx.fillText('MUSICAL SCORES BY MARTIN GALWAY', 128, 105);

    ctx.fillStyle = '#ffffff';
    ctx.fillText('MODULE SYSTEM:', 128, 135);
    ctx.fillStyle = '#ffff00';
    ctx.fillText('(2) REGIO  (3) GRUM', 128, 150);
    ctx.fillText('(4) BETA   (5) DELTA', 128, 165);

    ctx.fillStyle = (Math.floor(Date.now() / 400) % 2 === 0) ? '#00ff00' : '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('PRESS SPACE OR 1 TO PLAY', 128, 205);

    ctx.textAlign = 'left';
  }

  renderWingerReady() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WINGER READY', 128, 110);

    ctx.fillStyle = (Math.floor(Date.now() / 250) % 2 === 0) ? '#ffffff' : '#ff0000';
    ctx.font = '10px monospace';
    ctx.fillText('PRESS SPACE TO LAUNCH', 128, 130);
    ctx.textAlign = 'left';
  }

  renderGameOver() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', 128, 110);

    ctx.fillStyle = '#ffff00';
    ctx.font = '11px monospace';
    ctx.fillText(`FINAL SCORE: ${this.player.score}`, 128, 135);

    ctx.fillStyle = '#ffffff';
    ctx.fillText('PRESS SPACE TO RESTART', 128, 165);
    ctx.textAlign = 'left';
  }

  renderVictory() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION COMPLETE!', 128, 100);

    ctx.fillStyle = '#ffff00';
    ctx.font = '11px monospace';
    ctx.fillText('MANDLER CORE DESTROYED', 128, 125);
    ctx.fillText(`SCORE: ${this.player.score}`, 128, 145);

    ctx.fillStyle = '#ffffff';
    ctx.fillText('PRESS SPACE TO PLAY AGAIN', 128, 175);
    ctx.textAlign = 'left';
  }
}

// Bootstrap when DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.terraGame = new TerraCrestaGame();
});
