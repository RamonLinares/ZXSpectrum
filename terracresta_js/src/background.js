/**
 * Terra Cresta - Procedural & Tilemap Vertical Scrolling Background
 * Renders islands, space runways, deep sea, and planetary terrain.
 */

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
      { x: 30, y: 40, w: 70, h: 100, color: '#225522', edgeColor: '#448833' },
      { x: 150, y: -200, w: 85, h: 140, color: '#443322', edgeColor: '#775533' },
      { x: 40, y: -550, w: 95, h: 160, color: '#225522', edgeColor: '#448833' },
      { x: 130, y: -950, w: 100, h: 180, color: '#224455', edgeColor: '#4488aa' },
      { x: 20, y: -1400, w: 120, h: 220, color: '#443322', edgeColor: '#775533' },
      { x: 110, y: -1900, w: 110, h: 200, color: '#225522', edgeColor: '#448833' },
      { x: 50, y: -2400, w: 150, h: 260, color: '#332244', edgeColor: '#664488' } // Boss Base Island
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
    ctx.fillStyle = '#000018';
    ctx.fillRect(0, 0, 256, 240);

    // 2. Render Stars
    for (const s of this.stars) {
      ctx.fillStyle = s.brightness;
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
    }

    // 3. Render Terrain Islands
    for (const isl of this.islands) {
      if (isl.y + isl.h < 0 || isl.y > 240) continue;

      ctx.fillStyle = isl.edgeColor;
      ctx.fillRect(Math.floor(isl.x), Math.floor(isl.y), isl.w, isl.h);

      ctx.fillStyle = isl.color;
      ctx.fillRect(Math.floor(isl.x + 3), Math.floor(isl.y + 3), isl.w - 6, isl.h - 6);

      // Grid terrain texture
      ctx.fillStyle = isl.edgeColor;
      for (let tx = isl.x + 12; tx < isl.x + isl.w - 8; tx += 16) {
        for (let ty = isl.y + 12; ty < isl.y + isl.h - 8; ty += 16) {
          ctx.fillRect(Math.floor(tx), Math.floor(ty), 2, 2);
        }
      }
    }
  }
}
