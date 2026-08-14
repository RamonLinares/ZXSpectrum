import { RAW_8X8_TILES } from './extracted_data.js';

export class Background {
  constructor() {
    this.scrollY = 0;
    this.stars = [];
    this.islands = [];
    this.initStars();
    this.initIslands();
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < 45; i++) {
      this.stars.push({
        x: Math.random() * 256,
        y: Math.random() * 240,
        speed: 0.5 + Math.random() * 1.5,
        brightness: Math.random() > 0.5 ? '#ffffff' : '#00ffff'
      });
    }
  }

  initIslands() {
    this.islands = [
      { x: 30, y: 40, w: 72, h: 104, tileIdx: 12, color: '#22aa22' },
      { x: 150, y: -200, w: 88, h: 144, tileIdx: 18, color: '#aa7733' },
      { x: 40, y: -550, w: 96, h: 160, tileIdx: 14, color: '#22aa22' },
      { x: 130, y: -950, w: 104, h: 184, tileIdx: 24, color: '#0088cc' },
      { x: 20, y: -1400, w: 120, h: 216, tileIdx: 18, color: '#aa7733' },
      { x: 110, y: -1900, w: 112, h: 200, tileIdx: 12, color: '#22aa22' },
      { x: 50, y: -2400, w: 152, h: 256, tileIdx: 30, color: '#cc44aa' } // Boss Base Island
    ];
  }

  update(speed) {
    this.scrollY += speed;

    // Scroll stars
    for (const s of this.stars) {
      s.y += s.speed * speed;
      if (s.y > 240) {
        s.y = 0;
        s.x = Math.random() * 256;
      }
    }

    // Scroll islands
    for (const isl of this.islands) {
      isl.y += speed;
    }
  }

  render(ctx) {
    // 1. Deep Space Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 240);

    // 2. Render Stars
    for (const s of this.stars) {
      ctx.fillStyle = s.brightness;
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
    }

    // 3. Render Terrain Islands with authentic 8x8 Disassembled Tiles
    for (const isl of this.islands) {
      if (isl.y + isl.h < 0 || isl.y > 240) continue;

      const tile = RAW_8X8_TILES[isl.tileIdx % RAW_8X8_TILES.length];
      const startX = Math.floor(isl.x);
      const startY = Math.floor(isl.y);
      ctx.fillStyle = isl.color;

      for (let tx = 0; tx < isl.w; tx += 8) {
        for (let ty = 0; ty < isl.h; ty += 8) {
          const px = startX + tx;
          const py = startY + ty;
          if (py < -8 || py > 240) continue;

          // Blit authentic 8x8 tile
          if (tile) {
            for (let r = 0; r < 8; r++) {
              const b = tile[r];
              for (let bit = 7; bit >= 0; bit--) {
                if (b & (1 << bit)) {
                  ctx.fillRect(px + (7 - bit), py + r, 1, 1);
                }
              }
            }
          } else {
            ctx.fillRect(px, py, 8, 8);
          }
        }
      }
    }
  }
}
