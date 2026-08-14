/**
 * Terra Cresta - Procedural & Tilemap Vertical Scrolling Background
 * Renders space stars, islands, planetary terrain, runway markings, and crater rings.
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
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: Math.random() * 256,
        y: Math.random() * 240,
        speed: 0.4 + Math.random() * 1.6,
        color: Math.random() > 0.6 ? '#ffff55' : (Math.random() > 0.3 ? '#44ffff' : '#ffffff')
      });
    }
  }

  initIslands() {
    this.islands = [
      { x: 24, y: 30, w: 80, h: 120, type: 'green', name: 'Alpha Base' },
      { x: 140, y: -220, w: 90, h: 150, type: 'brown', name: 'Desert Ridge' },
      { x: 30, y: -580, w: 100, h: 170, type: 'green', name: 'Beta Station' },
      { x: 120, y: -1000, w: 110, h: 190, type: 'blue', name: 'Deep Sea Ring' },
      { x: 20, y: -1450, w: 120, h: 220, type: 'brown', name: 'Volcanic Rift' },
      { x: 100, y: -1950, w: 115, h: 210, type: 'green', name: 'Delta Base' },
      { x: 40, y: -2500, w: 170, h: 280, type: 'boss', name: 'Mandler Core Island' }
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
    // 1. Deep Space Black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 240);

    // 2. Stars
    for (const s of this.stars) {
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
    }

    // 3. Terrain Islands
    for (const isl of this.islands) {
      if (isl.y + isl.h < 0 || isl.y > 240) continue;

      const sx = Math.floor(isl.x);
      const sy = Math.floor(isl.y);

      let mainColor = '#115511';
      let edgeColor = '#33aa33';
      let innerColor = '#0a3a0a';

      if (isl.type === 'brown') {
        mainColor = '#664411';
        edgeColor = '#aa7722';
        innerColor = '#442a0a';
      } else if (isl.type === 'blue') {
        mainColor = '#114466';
        edgeColor = '#2288cc';
        innerColor = '#0a2a44';
      } else if (isl.type === 'boss') {
        mainColor = '#551155';
        edgeColor = '#aa22aa';
        innerColor = '#330833';
      }

      // Outer outline & island mass
      ctx.fillStyle = edgeColor;
      ctx.fillRect(sx, sy, isl.w, isl.h);

      ctx.fillStyle = mainColor;
      ctx.fillRect(sx + 3, sy + 3, isl.w - 6, isl.h - 6);

      // Inner terrain detail
      ctx.fillStyle = innerColor;
      ctx.fillRect(sx + 8, sy + 8, isl.w - 16, isl.h - 16);

      // Runway markings & crater grid
      ctx.fillStyle = edgeColor;
      for (let rx = sx + 16; rx < sx + isl.w - 12; rx += 20) {
        for (let ry = sy + 16; ry < sy + isl.h - 12; ry += 20) {
          ctx.fillRect(rx, ry, 3, 3);
        }
      }

      // Base runway strip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + Math.floor(isl.w / 2) - 1, sy + 10, 2, isl.h - 20);
    }
  }
}
