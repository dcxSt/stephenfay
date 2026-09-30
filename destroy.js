// Destroy mode: the little man gets a gun.
//
// When he's spawned, the page's text is redrawn into a pixel world (one cell per
// CSS pixel) laid exactly over the real text, which goes transparent underneath.
// He can stand on the letters, drop through them, climb the edges of the screen,
// and shoot, rocket and grenade the website into rubble. Esc puts the website
// back together and he goes back to strolling along the bottom of the screen;
// G hands him the gun again.
//
// index.html calls window.destroyGame.start() from the spawn button, and checks
// window.destroyMode to keep its own animation loop and input handlers out of
// the way while this one is running.
(function () {
    'use strict';

    // Movement tuning (pixels and seconds)
    const GRAVITY = 1700;
    const RUN_SPEED = 200;
    const JUMP_SPEED = 520;
    const FLIP_SPEED = 460;
    const FLIP_TIME = 0.45;
    const MAX_FALL = 850;
    const FAST_FALL = 1300;
    const CHUTE_FALL = 70;
    const CHUTE_SPEED = 130;
    const CLIMB_SPEED = 160;
    const STEP_UP = 7;          // he walks up bumps this tall...
    const STEP_DOWN = 5;        // ...and follows dips this deep without falling
    const HALF_W = 6;           // half the width of his feet
    const EDGE = 12;            // how close he gets to the sides of the screen (half his sprite)
    const HEIGHT = 36;          // feet to top of head
    const SHOULDER = 22;        // feet to shoulder
    const ARM = 7;
    const STEP = 1 / 120;       // physics timestep

    // World
    const SOLID = 96;           // text at least this opaque can be stood on and shot
    const ORIGINAL = 1, RUBBLE = 2;
    const CHAR_RGB = [26, 12, 8];
    const SCORCH = [0, 0.3, 0.55, 0.8];
    const MAX_PARTICLES = 3000;
    const SKIP = 'script, style, noscript, button, #lightbox-modal, #virtual-joystick, #action-buttons, #destroy-hud';

    // His pixel art from index.css: [x, y, colour] offsets of 4px squares in his 24x40 box
    const SKIN = '#FDB22A', BLUE = '#0D6CBC', HAIR = '#000', SHIRT = '#FFFFFF', CANOPY_RED = '#FF5555';
    const BODY = [
        [8, 0, HAIR], [12, 0, HAIR], [8, 4, SKIN], [12, 4, SKIN], [8, 8, SKIN], [12, 8, SKIN],
        [8, 12, SHIRT], [12, 12, SHIRT], [8, 16, BLUE], [12, 16, BLUE], [8, 20, BLUE], [12, 20, BLUE],
    ];
    // Two frames of legs plus the back arm for each pose; the front arm holds the gun
    const POSES = {
        walk: [
            [[4, 12, SKIN], [4, 24, BLUE], [16, 24, BLUE], [4, 28, SKIN], [12, 28, SKIN], [4, 32, SKIN], [16, 32, SKIN]],
            [[4, 14, SKIN], [8, 24, BLUE], [12, 24, BLUE], [4, 28, SKIN], [16, 28, SKIN], [0, 32, SKIN], [20, 32, SKIN]],
        ],
        climb: [
            [[4, 8, SKIN], [4, 24, BLUE], [16, 24, BLUE], [0, 28, SKIN], [20, 28, SKIN]],
            [[4, 4, SKIN], [8, 24, BLUE], [12, 24, BLUE], [4, 28, SKIN], [16, 28, SKIN]],
        ],
        chute: [
            [[0, 4, SKIN], [8, 24, BLUE], [12, 24, BLUE], [8, 28, SKIN], [12, 28, SKIN]],
            [[0, 8, SKIN], [4, 24, BLUE], [16, 24, BLUE], [4, 28, SKIN], [16, 28, SKIN]],
        ],
    };
    const CANOPY = [[0, -4], [4, -8], [8, -10], [12, -10], [16, -8], [20, -4]];

    // Guns are drawn from these at 2px per character; grip and muzzle are in those units.
    // Dark mode gets lighter metal so they don't vanish into the background.
    const GUN_COLORS = {
        light: { k: '#262626', g: '#555555', l: '#8c8c8c', w: '#7a4a22', o: '#5b6b33', t: '#36c6d9' },
        dark: { k: '#6e6e6e', g: '#9a9a9a', l: '#b8b8b8', w: '#9a6a3a', o: '#7d8f4a', t: '#36c6d9' },
    };
    const WEAPONS = [
        {
            name: 'pistol', cooldown: 0.17, speed: 1100, pellets: 1, spread: 0.02, hole: 3.5, pierce: 2, kick: 3, shake: 1, push: 0, sound: 'pistol',
            art: ['gggggggg', 'kkkkkkkk', 'kk......', 'kk......'], grip: [1, 2], muzzle: [8, 1],
        },
        {
            name: 'smg', cooldown: 0.065, speed: 1200, pellets: 1, spread: 0.08, hole: 2.8, pierce: 1, kick: 2, shake: 0.6, push: 0, sound: 'smg',
            art: ['..lllllll..', 'kkkkkkkkkkk', 'kk.kk......', '...kk......', '...kk......'], grip: [3.5, 2], muzzle: [11, 1.5],
        },
        {
            name: 'shotgun', cooldown: 0.65, speed: 950, pellets: 7, spread: 0.22, hole: 3.5, kick: 7, shake: 3, push: 110, sound: 'shotgun',
            art: ['...ggggggggggg', 'wwwkkkkkkkkkkk', 'ww..kk........', 'w.............'], grip: [4.5, 2], muzzle: [14, 1],
        },
        {
            name: 'rocket', cooldown: 0.9, speed: 480, kind: 'rocket', blast: 34, kick: 9, shake: 2, push: 140, sound: 'rocket',
            art: ['.oooooooooooooo.', 'oooooooooooooooo', '.oooooooooooooo.', '....kk..kk......', '....kk..........'], grip: [5, 3.5], muzzle: [16, 1.5],
        },
        {
            name: 'railgun', cooldown: 1.1, kind: 'rail', hole: 3, kick: 10, shake: 5, push: 170, sound: 'rail',
            art: ['..ggggggggggggg', 'kkktttttttttttt', 'kk.ggggggggggg.', 'kk.............'], grip: [1, 2.5], muzzle: [15, 1.5],
        },
    ];
    const GRENADE = { cooldown: 0.5, fuse: 1.6, blast: 42, speed: 520 };

    const DEBRIS = 0, SPARK = 1, SHELL = 2, SMOKE = 3, FIRE = 4;
    const KEYS = {
        KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
        KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', Space: 'jump',
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // World state: one cell per CSS pixel of the document, row-major
    let W = 0, H = 0;
    let alp = null, pal = null, shade = null, kind = null;
    let worldCanvas = null, worldCtx = null, worldImg = null, px32 = null;
    let dirtyX0, dirtyY0, dirtyX1, dirtyY1;
    const palette = [null, [0, 0, 0], [0, 0, 0]];   // 1: text, 2: links
    let colorCache = new Map();
    let solidTotal = 0, solidRemoved = 0;

    let active = false, starting = false;
    let view = null, ctx = null, dpr = 1;
    let hud = null, pctEl = null, muteEl = null, shownPct = -1;
    let raf = 0, lastTime = 0, acc = 0, rebuildTimer = 0, startToken = 0, camHold = 0;
    let helpOn = window.matchMedia('(min-width: 1272px) and (pointer: fine)').matches;
    let guy = null;
    let weapon = 0, cooldown = 0, nadeCooldown = 0, firing = false, muzzleFlash = 0, shakeAmt = 0;
    let bullets = [], rockets = [], nades = [], parts = [], beams = [], flashes = [];
    let scrollX = 0, scrollY = 0, fly = null, flyRect = null;
    const pointer = { has: false, x: 0, y: 0, touchId: null };
    const keys = {};
    const tapped = {};   // presses not yet seen by a physics step, so quick taps still count

    let gunColors = GUN_COLORS.light, gunSprites = [];
    function buildGunSprites() {
        gunSprites = WEAPONS.map(w => {
            const c = document.createElement('canvas');
            c.width = w.art[0].length * 2;
            c.height = w.art.length * 2;
            const g = c.getContext('2d');
            w.art.forEach((row, y) => [...row].forEach((ch, x) => {
                if (gunColors[ch]) {
                    g.fillStyle = gunColors[ch];
                    g.fillRect(x * 2, y * 2, 2, 2);
                }
            }));
            return c;
        });
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const approach = (v, target, d) => v < target ? Math.min(target, v + d) : Math.max(target, v - d);
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    // ---------------------------------------------------------------- the world

    const colorCtx = document.createElement('canvas').getContext('2d');
    function parseColor(str) {
        str = (str || '').trim();
        if (!str) return null;
        colorCtx.fillStyle = '#000';
        colorCtx.fillStyle = str;
        const v = colorCtx.fillStyle;
        if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
        const m = v.match(/[\d.]+/g);
        return m ? [+m[0], +m[1], +m[2]] : null;
    }

    // Colours come from the theme variables rather than computed styles, because
    // the real text is transparent while we're running and the theme can change.
    function readPalette() {
        const root = getComputedStyle(document.documentElement);
        palette[1] = parseColor(root.getPropertyValue('--text-color')) || [0, 0, 0];
        palette[2] = parseColor(root.getPropertyValue('--link-color')) || palette[1];
        colorCache = new Map();
        const [r, g, b] = parseColor(root.getPropertyValue('--bg-color')) || [255, 255, 255];
        gunColors = r * 0.299 + g * 0.587 + b * 0.114 < 128 ? GUN_COLORS.dark : GUN_COLORS.light;
        buildGunSprites();
    }

    function cellColor(p, s) {
        const key = p * 4 + s;
        let c = colorCache.get(key);
        if (!c) {
            const [r, g, b] = mix(palette[p], s);
            c = `rgb(${r | 0},${g | 0},${b | 0})`;
            colorCache.set(key, c);
        }
        return c;
    }

    function mix(rgb, s) {
        if (!s) return rgb;
        const k = SCORCH[s];
        return [rgb[0] + (CHAR_RGB[0] - rgb[0]) * k, rgb[1] + (CHAR_RGB[1] - rgb[1]) * k, rgb[2] + (CHAR_RGB[2] - rgb[2]) * k];
    }

    // Draw every visible character of the page where the browser laid it out, then
    // read the pixels back. Text is drawn red and links green so the readback tells
    // us which palette colour each cell should use.
    function rasterize() {
        const root = document.documentElement;
        W = root.clientWidth;
        H = Math.min(16000, Math.max(root.scrollHeight, window.innerHeight));
        const off = document.createElement('canvas');
        off.width = W;
        off.height = H;
        const c = off.getContext('2d', { willReadFrequently: true });
        c.textBaseline = 'alphabetic';
        const sx = window.scrollX, sy = window.scrollY;
        const range = document.createRange();
        const metrics = new Map();
        let lowest = 0;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.nodeValue;
            if (!text.trim()) continue;
            const el = node.parentElement;
            if (!el || el.closest(SKIP)) continue;
            const style = getComputedStyle(el);
            if (style.visibility !== 'visible') continue;

            const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            c.font = font;
            let m = metrics.get(font);
            if (!m) {
                const t = c.measureText('Hg');
                m = { asc: t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent, desc: t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent };
                metrics.set(font, m);
            }
            c.fillStyle = el.closest('a') ? '#00ff00' : '#ff0000';
            const transform = style.textTransform;
            const baseline = r => r.top + sy + (r.height - (m.asc + m.desc)) / 2 + m.asc;

            let i = 0;
            for (const ch of text) {
                if (ch.trim()) {
                    range.setStart(node, i);
                    range.setEnd(node, i + ch.length);
                    const r = range.getClientRects()[0];
                    if (r && r.width > 0 && r.height > 0) {
                        const glyph = transform === 'uppercase' ? ch.toUpperCase() : transform === 'lowercase' ? ch.toLowerCase() : ch;
                        c.fillText(glyph, r.left + sx, baseline(r));
                        lowest = Math.max(lowest, r.bottom + sy);
                    }
                }
                i += ch.length;
            }

            if (el.closest('u')) {
                const size = parseFloat(style.fontSize);
                range.selectNodeContents(node);
                for (const r of range.getClientRects()) {
                    if (r.width < 1) continue;
                    const thick = Math.max(1, Math.round(size / 16));
                    c.fillRect(r.left + sx, Math.round(baseline(r)) + Math.max(1, Math.ceil(thick / 2)), r.width, thick);
                }
            }
        }

        // The floor sits just under the last line, not at the bottom of the page's
        // trailing whitespace, so he can always jump back up onto the text
        H = Math.min(H, Math.max(Math.ceil(window.innerHeight / 2), Math.ceil(lowest) + 40));
        const data = c.getImageData(0, 0, W, H).data;
        const n = W * H;
        alp = new Uint8Array(n);
        pal = new Uint8Array(n);
        shade = new Uint8Array(n);
        kind = new Uint8Array(n);
        solidTotal = 0;
        solidRemoved = 0;
        for (let i = 0, q = 0; i < n; i++, q += 4) {
            const a = data[q + 3];
            if (a < 16) continue;
            alp[i] = a;
            pal[i] = data[q] >= data[q + 1] ? 1 : 2;
            kind[i] = ORIGINAL;
            if (a >= SOLID) solidTotal++;
        }

        worldCanvas = document.createElement('canvas');
        worldCanvas.width = W;
        worldCanvas.height = H;
        worldCtx = worldCanvas.getContext('2d');
        worldImg = worldCtx.createImageData(W, H);
        px32 = new Uint32Array(worldImg.data.buffer);
        repaint();
    }

    function paintCell(i) {
        const a = alp[i];
        if (!a) {
            px32[i] = 0;
            return;
        }
        const [r, g, b] = mix(palette[pal[i]], shade[i]);
        px32[i] = ((a << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
    }

    function repaint() {
        for (let i = 0; i < px32.length; i++) paintCell(i);
        worldCtx.putImageData(worldImg, 0, 0);
        dirtyX0 = dirtyY0 = Infinity;
        dirtyX1 = dirtyY1 = -Infinity;
    }

    function markDirty(x0, y0, x1, y1) {
        if (x0 < dirtyX0) dirtyX0 = x0;
        if (y0 < dirtyY0) dirtyY0 = y0;
        if (x1 > dirtyX1) dirtyX1 = x1;
        if (y1 > dirtyY1) dirtyY1 = y1;
    }

    function flushWorld() {
        if (dirtyX1 < dirtyX0) return;
        worldCtx.putImageData(worldImg, 0, 0, dirtyX0, dirtyY0, dirtyX1 - dirtyX0 + 1, dirtyY1 - dirtyY0 + 1);
        dirtyX0 = dirtyY0 = Infinity;
        dirtyX1 = dirtyY1 = -Infinity;
    }

    // The bottom of the page is solid floor; the sides and sky are open.
    function solidAt(x, y) {
        if (y >= H) return true;
        if (x < 0 || x >= W || y < 0) return false;
        return alp[y * W + x] >= SOLID;
    }

    // A cell he can stand on: solid, with nothing solid on top of it
    function isSurface(x, r) {
        if (r >= H) return true;
        if (r < 0 || x < 0 || x >= W) return false;
        const i = r * W + x;
        return alp[i] >= SOLID && (r === 0 || alp[i - W] < SOLID);
    }

    // Topmost surface under his feet between rows `from` and `to`, or null
    function surfaceBetween(px, from, to) {
        from = Math.max(0, from);
        to = Math.min(H, to);
        const c0 = Math.max(0, Math.floor(px - HALF_W)), c1 = Math.min(W - 1, Math.floor(px + HALF_W));
        for (let r = from; r <= to; r++) {
            for (let c = c0; c <= c1; c++) if (isSurface(c, r)) return r;
        }
        return null;
    }

    // Where his feet go while he walks: the top of what he's standing on, a bump
    // joined to it that's low enough to step onto, or a dip he can follow. Surfaces
    // that only come near his feet without touching the ground he's on (the
    // descenders of the line above, say) don't count, or he'd climb up through them.
    function groundUnder(px, py) {
        const y = Math.round(py);
        const c0 = Math.max(0, Math.floor(px - HALF_W)), c1 = Math.min(W - 1, Math.floor(px + HALF_W));
        let best = null;
        for (let c = c0; c <= c1; c++) {
            let r = null;
            if (solidAt(c, y)) {
                let top = y;
                while (top > y - STEP_UP && solidAt(c, top - 1)) top--;
                if (!solidAt(c, top - 1)) r = top;
            } else {
                for (let k = y + 1; k <= y + STEP_DOWN; k++) {
                    if (solidAt(c, k)) {
                        r = k;
                        break;
                    }
                }
            }
            if (r !== null && (best === null || r < best)) best = r;
        }
        return best;
    }

    function feetInSolid(px, py) {
        const r = Math.floor(py);
        if (r >= H) return false;
        const c0 = Math.max(0, Math.floor(px - HALF_W)), c1 = Math.min(W - 1, Math.floor(px + HALF_W));
        for (let y = Math.max(0, r - 1); y <= Math.min(H - 1, r + 1); y++) {
            for (let c = c0; c <= c1; c++) if (alp[y * W + c] >= SOLID) return true;
        }
        return false;
    }

    // First solid point on the segment, or null
    function trace(x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
        for (let i = 0; i <= n; i++) {
            const x = x0 + dx * i / n, y = y0 + dy * i / n;
            if (solidAt(Math.floor(x), Math.floor(y))) return { x, y };
        }
        return null;
    }

    // Clear a disc of the world. Some of what was there flies off as debris,
    // either away from the centre (explosions) or back along (fx, fy) (bullets).
    function carve(cx, cy, r, o) {
        const scorch = o.scorch || 0, rr = r + scorch;
        const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(W - 1, Math.ceil(cx + rr));
        const y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(H - 1, Math.ceil(cy + rr));
        if (x0 > x1 || y0 > y1) return 0;
        const r2 = r * r, rr2 = rr * rr, inner2 = (r + scorch * 0.5) ** 2;
        let hits = 0;
        for (let y = y0; y <= y1; y++) {
            const dy = y + 0.5 - cy;
            for (let x = x0; x <= x1; x++) {
                const i = y * W + x;
                const a = alp[i];
                if (!a) continue;
                const dx = x + 0.5 - cx, d2 = dx * dx + dy * dy;
                if (d2 <= r2) {
                    if (a >= SOLID) {
                        hits++;
                        if (kind[i] === ORIGINAL) solidRemoved++;
                        if (Math.random() < o.debris && parts.length < MAX_PARTICLES) {
                            let vx, vy;
                            const v = o.speed * rand(0.3, 1);
                            if (o.fx === undefined) {
                                const d = Math.sqrt(d2) || 1;
                                vx = dx / d * v + rand(-30, 30);
                                vy = dy / d * v - rand(60, 180);
                            } else {
                                vx = o.fx * v + rand(-0.5, 0.5) * o.speed;
                                vy = o.fy * v - rand(40, 140);
                            }
                            parts.push({ type: DEBRIS, x: x + 0.5, y: y + 0.5, vx, vy, life: 8, pal: pal[i], shade: shade[i] });
                        }
                    }
                    alp[i] = pal[i] = shade[i] = kind[i] = 0;
                    px32[i] = 0;
                } else if (scorch && d2 <= rr2 && shade[i] < 3) {
                    shade[i] = Math.min(3, shade[i] + (d2 <= inner2 ? 2 : 1));
                    paintCell(i);
                }
            }
        }
        markDirty(x0, y0, x1, y1);
        return hits;
    }

    // Debris that lands becomes rubble, sliding off piles like sand
    function settle(x, y, p, s) {
        let cx = clamp(Math.floor(x), 0, W - 1), cy = clamp(Math.floor(y), 0, H - 1);
        for (let k = 0; k < 8 && cy > 0 && alp[cy * W + cx]; k++) cy--;
        if (alp[cy * W + cx]) return;
        for (let k = 0; k < 40 && cy + 1 < H; k++) {
            const below = (cy + 1) * W;
            if (!alp[below + cx]) break;
            const d = Math.random() < 0.5 ? -1 : 1;
            if (cx + d >= 0 && cx + d < W && !alp[below + cx + d] && !alp[cy * W + cx + d]) cx += d;
            else if (cx - d >= 0 && cx - d < W && !alp[below + cx - d] && !alp[cy * W + cx - d]) cx -= d;
            else break;
            cy++;
        }
        // slid off the edge of something: fall the rest of the way as debris
        if (cy + 1 < H && !alp[(cy + 1) * W + cx]) {
            if (parts.length < MAX_PARTICLES) parts.push({ type: DEBRIS, x: cx + 0.5, y: cy + 0.5, vx: 0, vy: 0, life: 8, pal: p, shade: s });
            return;
        }
        const i = cy * W + cx;
        alp[i] = 255;
        pal[i] = p;
        shade[i] = s;
        kind[i] = RUBBLE;
        paintCell(i);
        markDirty(cx, cy, cx, cy);
    }

    // ------------------------------------------------------------------ the guy

    function newGuy(x, y, chute) {
        return {
            x, y, vx: 0, vy: 0, grounded: false, state: chute ? 'chute' : 'air', forceChute: chute,
            jumps: 1, facing: 1, aim: 0, wall: 0, wallPush: 0, coyote: 0, dropping: false,
            spin: 0, walk: 0, kick: 0, jumpHeld: false, spaceHeld: false, downHeld: false, groundTime: 0,
        };
    }

    function input() {
        const kp = window.keysPressed || {};   // the touch joystick in index.html writes here
        return {
            left: !!(keys.left || kp.ArrowLeft),
            right: !!(keys.right || kp.ArrowRight),
            up: !!(keys.up || kp.ArrowUp),
            down: !!(keys.down || kp.ArrowDown),
            space: !!keys.jump,
            tapped: { up: !!tapped.up, down: !!tapped.down, jump: !!tapped.jump },
        };
    }

    function updateGuy(dt) {
        const g = guy, k = input();
        const jumpHeld = k.up || k.space;
        let jumpPressed = (jumpHeld && !g.jumpHeld) || k.tapped.up || k.tapped.jump;
        const spacePressed = (k.space && !g.spaceHeld) || k.tapped.jump;
        const downPressed = (k.down && !g.downHeld) || k.tapped.down;
        tapped.up = tapped.down = tapped.jump = false;
        g.jumpHeld = jumpHeld;
        g.spaceHeld = k.space;
        g.downHeld = k.down;
        const dir = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        g.spin = Math.max(0, g.spin - dt);
        g.coyote = Math.max(0, g.coyote - dt);
        g.kick = Math.max(0, g.kick - dt * 40);

        if (g.state === 'climb') {
            g.x = g.wall < 0 ? EDGE : W - EDGE;
            const climb = (k.down ? 1 : 0) - (k.up ? 1 : 0);
            g.vx = 0;
            g.vy = climb * CLIMB_SPEED;
            if (climb) g.walk += dt;
            const y0 = g.y;
            g.y = Math.max(HEIGHT, g.y + g.vy * dt);
            if (climb > 0) {
                const land = surfaceBetween(g.x, Math.ceil(y0), Math.floor(g.y));
                if (land !== null) {
                    g.y = land;
                    g.vy = 0;
                    g.grounded = true;
                    g.groundTime = 0;
                    g.state = 'ground';
                    g.jumps = 0;
                    return;
                }
            }
            if (spacePressed || dir === -g.wall) {
                g.state = 'air';
                g.vx = -g.wall * 260;
                g.vy = spacePressed ? -JUMP_SPEED * 0.85 : 0;
                g.jumps = 1;
                g.x -= g.wall;
            }
            return;
        }

        // Running. Blasts can throw him faster than he runs; let that carry.
        const speed = g.state === 'chute' ? CHUTE_SPEED : RUN_SPEED;
        let accel = g.grounded ? 2400 : 1300;
        if (Math.abs(g.vx) > speed && Math.sign(g.vx) !== -dir) accel = g.grounded ? 1200 : 350;
        g.vx = approach(g.vx, dir * speed, accel * dt);
        g.x += g.vx * dt;
        if (g.grounded && Math.abs(g.vx) > 20) g.walk += dt;

        // The edges of the screen are walls he can climb, like before
        if (g.x <= EDGE || g.x >= W - EDGE) {
            const side = g.x <= EDGE ? -1 : 1;
            g.x = side < 0 ? EDGE : W - EDGE;
            g.vx = 0;
            if (dir === side) {
                g.wallPush += dt;
                if (!g.grounded || k.up || g.wallPush > 0.15) {
                    g.state = 'climb';
                    g.wall = side;
                    g.grounded = false;
                    g.forceChute = false;
                    g.spin = 0;
                    g.vy = 0;
                    return;
                }
            } else g.wallPush = 0;
        } else g.wallPush = 0;

        if (g.grounded) {
            g.groundTime += dt;
            if (jumpPressed) {
                g.vy = -JUMP_SPEED;
                g.grounded = false;
                g.jumps = 1;
                jumpPressed = false;   // this press was the jump, not the flip
            } else if ((downPressed || (k.down && g.groundTime > 0.2)) && g.y < H) {
                // drop through the line he's standing on (holding S keeps going, a line at a time)
                g.grounded = false;
                g.dropping = true;
                g.y += 1;
                g.vy = 60;
                g.jumps = 1;
            } else {
                const ground = groundUnder(g.x, g.y);
                if (ground === null) {
                    g.grounded = false;
                    g.coyote = 0.08;
                    g.jumps = 1;
                    g.vy = 0;
                } else {
                    g.y = ground;
                    g.vy = 0;
                }
            }
        }

        if (!g.grounded) {
            if (jumpPressed) {
                if (g.coyote > 0) {
                    g.vy = -JUMP_SPEED;
                    g.coyote = 0;
                } else if (g.jumps < 2) {
                    g.vy = -FLIP_SPEED;
                    g.jumps = 2;
                    g.spin = FLIP_TIME;
                    g.forceChute = false;
                }
            }
            const gliding = (jumpHeld || g.forceChute) && g.vy > 0 && !k.down && g.spin <= 0;
            const vy0 = g.vy;
            g.vy += GRAVITY * (k.down ? 1.8 : 1) * dt;
            if (gliding) g.vy = Math.min(g.vy, Math.max(CHUTE_FALL, vy0 - 1800 * dt));
            g.vy = Math.min(g.vy, k.down ? FAST_FALL : MAX_FALL);
            g.state = gliding ? 'chute' : 'air';

            const y0 = g.y, y1 = g.y + g.vy * dt;
            let land = null;
            if (g.vy > 0) {
                // when dropping, ignore the line he's falling through until his feet are clear of it
                if (g.dropping && !feetInSolid(g.x, y1)) g.dropping = false;
                if (!g.dropping) land = surfaceBetween(g.x, Math.ceil(y0), Math.floor(y1));
            }
            if (land !== null) {
                if (g.vy > 500) dust(g.x, land, 6);
                g.y = land;
                g.vy = 0;
                g.grounded = true;
                g.groundTime = 0;
                g.jumps = 0;
                g.spin = 0;
                g.forceChute = false;
            } else {
                g.y = y1;
                if (g.y < 0) {
                    g.y = 0;
                    g.vy = Math.max(0, g.vy);
                }
            }
        }
        if (g.grounded) g.state = 'ground';
    }

    function shoulder() {
        return { x: guy.x + guy.facing, y: guy.y - SHOULDER };
    }

    function updateAim() {
        const s = shoulder();
        if (pointer.has) {
            const tx = pointer.x + scrollX, ty = pointer.y + scrollY;
            if (Math.abs(tx - guy.x) > 2) guy.facing = tx > guy.x ? 1 : -1;
            guy.aim = Math.atan2(ty - s.y, tx - s.x);
        } else {
            if (guy.vx > 5) guy.facing = 1;
            else if (guy.vx < -5) guy.facing = -1;
            guy.aim = guy.facing > 0 ? 0 : Math.PI;
        }
        if (guy.state === 'climb') guy.facing = guy.wall;
    }

    function gunPose() {
        const s = shoulder(), a = guy.aim, cos = Math.cos(a), sin = Math.sin(a);
        const reach = ARM - guy.kick;
        return { s, a, cos, sin, flip: cos < 0 ? -1 : 1, hx: s.x + cos * reach, hy: s.y + sin * reach, reach };
    }

    function muzzleOf(w, pose) {
        const mx = (w.muzzle[0] - w.grip[0]) * 2, my = (w.muzzle[1] - w.grip[1]) * 2 * pose.flip;
        return { x: pose.hx + pose.cos * mx - pose.sin * my, y: pose.hy + pose.sin * mx + pose.cos * my };
    }

    // ------------------------------------------------------------------ weapons

    function fire() {
        const w = WEAPONS[weapon], pose = gunPose(), m = muzzleOf(w, pose);
        cooldown = w.cooldown;
        guy.kick = w.kick;
        muzzleFlash = 0.05;
        addShake(w.shake);
        sfx(w.sound);
        if (w.push) {
            guy.vx -= pose.cos * w.push;
            if (!guy.grounded && guy.state !== 'climb') guy.vy -= pose.sin * w.push * 0.7;
        }
        if (w.kind === 'rocket') {
            rockets.push({ x: m.x, y: m.y, vx: pose.cos * w.speed, vy: pose.sin * w.speed, life: 3, blast: w.blast });
            return;
        }
        if (w.kind === 'rail') {
            rail(m.x, m.y, pose.cos, pose.sin, w.hole);
            return;
        }
        for (let i = 0; i < w.pellets; i++) {
            const a = pose.a + rand(-w.spread, w.spread), v = w.speed * rand(0.9, 1.1);
            bullets.push({ x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.5, hole: w.hole, pierce: w.pierce || 0 });
        }
        if (parts.length < MAX_PARTICLES) {
            parts.push({ type: SHELL, x: pose.hx, y: pose.hy, vx: -guy.facing * rand(40, 110), vy: -rand(120, 220), life: 1.2, bounces: 0 });
        }
    }

    function throwGrenade() {
        if (!active || nadeCooldown > 0) return;
        nadeCooldown = GRENADE.cooldown;
        const s = shoulder();
        const a = pointer.has ? guy.aim : (guy.facing > 0 ? -0.5 : Math.PI + 0.5);
        nades.push({
            x: s.x, y: s.y,
            vx: Math.cos(a) * GRENADE.speed + guy.vx * 0.5,
            vy: Math.sin(a) * GRENADE.speed + Math.min(0, guy.vy) * 0.3,
            fuse: GRENADE.fuse, spin: 0,
        });
        sfx('throw');
    }

    function rail(x, y, cos, sin, hole) {
        const max = Math.hypot(W, H);
        let len = 0;
        for (; len < max; len += 2) {
            const px = x + cos * len, py = y + sin * len;
            if (px < -hole || px > W + hole || py < -hole || py > H) break;
            carve(px, py, hole, { debris: 0.2, speed: 160, fx: -sin * (Math.random() < 0.5 ? 1 : -1), fy: cos });
            hitFly(px, py);
        }
        beams.push({ x0: x, y0: y, x1: x + cos * len, y1: y + sin * len, t: 0.3 });
    }

    function explode(x, y, R) {
        carve(x, y, R, { debris: 0.18, speed: 420, scorch: 6 });
        flashes.push({ x, y, r: R, t: 0, life: 0.18 }, { x, y, r: R, t: 0, life: 0.3, ring: true });
        for (let i = 0; i < 28 && parts.length < MAX_PARTICLES; i++) {
            const a = rand(0, Math.PI * 2), v = rand(40, 220);
            parts.push({ type: FIRE, x: x + rand(-R, R) * 0.4, y: y + rand(-R, R) * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rand(0.5, 1), max: 1, size: rand(R * 0.2, R * 0.4) });
        }
        for (let i = 0; i < 12 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SMOKE, x: x + rand(-R, R) * 0.5, y: y + rand(-R, R) * 0.5, vx: rand(-40, 40), vy: rand(-60, -10), life: rand(0.8, 1.6), max: 1.6, size: rand(4, 10) });
        }
        addShake(Math.min(14, R / 3));
        sfx('boom');

        // knock him (and everything else) around
        const reach = R * 2.2;
        const dx = guy.x - x, dy = guy.y - HEIGHT / 2 - y, d = Math.hypot(dx, dy) || 1;
        if (d < reach) {
            const f = 1 - d / reach, k = f * 950;
            guy.vx += dx / d * k;
            guy.vy += dy / d * k - 250 * f;
            if (guy.state === 'climb' && k > 250) guy.state = 'air';
            if (guy.vy < 0 && guy.state !== 'climb') {
                guy.grounded = false;
                guy.state = 'air';
                guy.jumps = 1;
            }
        }
        for (const n of nades) {
            const ndx = n.x - x, ndy = n.y - y, nd = Math.hypot(ndx, ndy) || 1;
            if (nd < reach) {
                n.vx += ndx / nd * (1 - nd / reach) * 600;
                n.vy += ndy / nd * (1 - nd / reach) * 600 - 100;
                if (nd < R) n.fuse = Math.min(n.fuse, rand(0.08, 0.2));
            }
        }
        for (const q of parts) {
            if (q.type !== DEBRIS) continue;
            const qdx = q.x - x, qdy = q.y - y, qd = Math.hypot(qdx, qdy) || 1;
            if (qd < reach) {
                q.vx += qdx / qd * (1 - qd / reach) * 500;
                q.vy += qdy / qd * (1 - qd / reach) * 500;
            }
        }
    }

    function impact(x, y, vx, vy, hole) {
        const v = Math.hypot(vx, vy) || 1;
        carve(x, y, hole, { debris: 0.6, speed: 170, fx: -vx / v, fy: -vy / v });
        for (let i = 0; i < 4 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: -vx / v * rand(60, 200) + rand(-80, 80), vy: -vy / v * rand(60, 200) + rand(-80, 80), life: rand(0.08, 0.2) });
        }
    }

    function dust(x, y, count) {
        for (let i = 0; i < count && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SMOKE, x: x + rand(-8, 8), y: y - 1, vx: rand(-50, 50), vy: rand(-30, -5), life: rand(0.3, 0.5), max: 0.5, size: rand(2, 4) });
        }
    }

    // You can finally do something about the fly
    function hitFly(x, y) {
        if (!flyRect || !fly.src.includes('fly.png')) return false;
        const sx = x - scrollX, sy = y - scrollY;
        if (sx < flyRect.left || sx > flyRect.right || sy < flyRect.top || sy > flyRect.bottom) return false;
        fly.src = 'assets/squashed-fly.webp';
        for (let i = 0; i < 10 && parts.length < MAX_PARTICLES; i++) {
            parts.push({ type: SPARK, x, y, vx: rand(-160, 160), vy: rand(-200, 40), life: rand(0.15, 0.35), color: '#6b8f23' });
        }
        sfx('splat');
        return true;
    }

    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
            b.life -= dt;
            const hit = trace(b.x, b.y, nx, ny);
            if (hitFly((b.x + nx) / 2, (b.y + ny) / 2) || hitFly(nx, ny)) {
                bullets.splice(i, 1);
                continue;
            }
            if (hit) {
                impact(hit.x, hit.y, b.vx, b.vy, b.hole);
                if (b.pierce-- > 0) {
                    // punch through and keep going from the far side of the hole
                    const v = Math.hypot(b.vx, b.vy);
                    b.x = hit.x + b.vx / v * b.hole;
                    b.y = hit.y + b.vy / v * b.hole;
                    continue;
                }
                bullets.splice(i, 1);
                continue;
            }
            b.x = nx;
            b.y = ny;
            if (b.life <= 0 || nx < -50 || nx > W + 50 || ny < -300) bullets.splice(i, 1);
        }
    }

    function updateRockets(dt) {
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
            r.life -= dt;
            if (Math.random() < 0.6 && parts.length < MAX_PARTICLES) {
                parts.push({ type: SMOKE, x: r.x, y: r.y, vx: rand(-15, 15), vy: rand(-25, 5), life: rand(0.3, 0.6), max: 0.6, size: rand(2, 4) });
            }
            const hit = trace(r.x, r.y, nx, ny);
            if (hit || hitFly(nx, ny) || r.life <= 0) {
                explode(hit ? hit.x : nx, hit ? hit.y : ny, r.blast);
                rockets.splice(i, 1);
                continue;
            }
            r.x = nx;
            r.y = ny;
            if (nx < -100 || nx > W + 100 || ny < -300) rockets.splice(i, 1);
        }
    }

    function updateNades(dt) {
        for (let i = nades.length - 1; i >= 0; i--) {
            const n = nades[i];
            n.fuse -= dt;
            if (n.fuse <= 0) {
                nades.splice(i, 1);
                explode(n.x, n.y - 2, GRENADE.blast);
                continue;
            }
            n.vy = Math.min(n.vy + GRAVITY * dt, MAX_FALL);
            // move a pixel at a time so it can't tunnel through thin letters
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(n.vx), Math.abs(n.vy)) * dt));
            for (let s = 0; s < steps; s++) {
                const nx = n.x + n.vx * dt / steps, ny = n.y + n.vy * dt / steps;
                if (nx < 2 || nx > W - 2 || solidAt(Math.floor(nx), Math.floor(n.y))) {
                    if (Math.abs(n.vx) > 60) sfx('clink');
                    n.vx = -n.vx * 0.45;
                } else n.x = nx;
                if (solidAt(Math.floor(n.x), Math.floor(ny))) {
                    if (n.vy > 120) sfx('clink');
                    if (n.vy > 0) n.vx *= 0.75;
                    n.vy = Math.abs(n.vy) < 60 ? 0 : -n.vy * 0.4;
                } else n.y = ny;
            }
            n.spin += n.vx * dt * 0.15;
        }
    }

    function updateParticles(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
            const q = parts[i];
            q.life -= dt;
            let dead = q.life <= 0;
            if (q.type === DEBRIS) {
                q.vy = Math.min(q.vy + GRAVITY * dt, MAX_FALL);
                const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
                if (nx < 0 || nx >= W) dead = true;
                else {
                    const hit = trace(q.x, q.y, nx, ny);
                    if (hit && q.vy < 0) {
                        // hit the underside of something: fall back down
                        q.vy = 0;
                        q.vx *= 0.5;
                    } else if (hit) {
                        // land just before whatever it hit
                        const d = Math.hypot(q.vx, q.vy) || 1;
                        settle(hit.x - q.vx / d, hit.y - q.vy / d, q.pal, q.shade);
                        dead = true;
                    } else {
                        q.x = nx;
                        q.y = ny;
                    }
                }
            } else if (q.type === SHELL) {
                q.vy += GRAVITY * dt;
                const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
                if (solidAt(Math.floor(nx), Math.floor(ny)) && q.vy > 0) {
                    if (q.bounces++ < 2) sfx('clink');
                    q.vy = -q.vy * 0.35;
                    q.vx *= 0.5;
                } else {
                    q.x = nx;
                    q.y = ny;
                }
            } else if (q.type === SPARK) {
                q.vy += GRAVITY * 0.4 * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
            } else {
                // smoke and fire drift up and slow down
                const drag = Math.exp(-dt * 3);
                q.vx *= drag;
                q.vy = q.vy * drag - (q.type === SMOKE ? 30 : 10) * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
                if (q.type === SMOKE) q.size += dt * 6;
            }
            if (dead) {
                parts[i] = parts[parts.length - 1];
                parts.pop();
            }
        }
    }

    function selectWeapon(i) {
        if (i === weapon || i < 0 || i >= WEAPONS.length) return;
        weapon = i;
        cooldown = Math.max(cooldown, 0.12);
        renderHud();
    }

    function addShake(s) {
        if (!reducedMotion) shakeAmt = Math.min(16, shakeAmt + s);
    }

    // ------------------------------------------------------------------- sound

    const audio = { ctx: null, out: null, noise: null, muted: false, last: {} };
    try { audio.muted = localStorage.getItem('destroyMuted') === '1'; } catch (_) { /* storage unavailable */ }

    function initAudio() {
        if (audio.ctx) {
            if (audio.ctx.state === 'suspended') audio.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        const comp = a.createDynamicsCompressor();
        comp.connect(a.destination);
        audio.out = a.createGain();
        audio.out.gain.value = 0.35;
        audio.out.connect(comp);
        audio.noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const d = audio.noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        audio.ctx = a;
    }

    function noise(t, dur, type, f0, f1, vol, q) {
        const a = audio.ctx, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = audio.noise;
        f.type = type;
        f.Q.value = q || 0.7;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f).connect(g).connect(audio.out);
        src.start(t, Math.random() * 0.5);
        src.stop(t + dur);
    }

    function tone(t, dur, type, f0, f1, vol) {
        const a = audio.ctx, o = a.createOscillator(), g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(audio.out);
        o.start(t);
        o.stop(t + dur);
    }

    const SOUNDS = {
        pistol: t => { noise(t, 0.09, 'bandpass', 2400, 700, 0.5, 0.9); tone(t, 0.06, 'square', 220, 90, 0.06); },
        smg: t => noise(t, 0.05, 'bandpass', 2800, 900, 0.35, 1),
        shotgun: t => { noise(t, 0.28, 'lowpass', 2600, 300, 0.8); tone(t, 0.12, 'sine', 140, 50, 0.3); },
        rocket: t => noise(t, 0.45, 'bandpass', 500, 1800, 0.4, 0.6),
        rail: t => { tone(t, 0.35, 'sawtooth', 2200, 120, 0.1); noise(t, 0.2, 'highpass', 3000, 1500, 0.25); },
        boom: t => { noise(t, 0.9, 'lowpass', 1200, 60, 1); tone(t, 0.5, 'sine', 110, 35, 0.6); },
        throw: t => noise(t, 0.12, 'bandpass', 900, 1600, 0.15, 1.5),
        clink: t => tone(t, 0.04, 'triangle', 1800, 1400, 0.04),
        splat: t => { noise(t, 0.15, 'lowpass', 900, 200, 0.5); tone(t, 0.1, 'sine', 300, 80, 0.2); },
    };

    function sfx(name) {
        if (audio.muted || !audio.ctx || audio.ctx.state !== 'running') return;
        const t = audio.ctx.currentTime;
        if (t - (audio.last[name] || 0) < 0.03) return;
        audio.last[name] = t;
        SOUNDS[name](t);
    }

    function toggleMute() {
        audio.muted = !audio.muted;
        try { localStorage.setItem('destroyMuted', audio.muted ? '1' : '0'); } catch (_) { /* storage unavailable */ }
        if (muteEl) muteEl.textContent = `${coarsePointer ? '' : '[m] '}sound ${audio.muted ? 'off' : 'on'}`;
    }

    // ------------------------------------------------------------------ drawing

    function render() {
        const vw = window.innerWidth, vh = window.innerHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, vw, vh);
        ctx.imageSmoothingEnabled = false;
        let ox = 0, oy = 0;
        if (shakeAmt > 0.3) {
            ox = rand(-shakeAmt, shakeAmt);
            oy = rand(-shakeAmt, shakeAmt);
        }

        const x0 = clamp(Math.floor(scrollX), 0, W), y0 = clamp(Math.floor(scrollY), 0, H);
        const w = Math.min(W - x0, Math.ceil(vw) + 1), h = Math.min(H - y0, Math.ceil(vh) + 1);
        if (w > 0 && h > 0) ctx.drawImage(worldCanvas, x0, y0, w, h, x0 - scrollX + ox, y0 - scrollY + oy, w, h);

        ctx.setTransform(dpr, 0, 0, dpr, (ox - scrollX) * dpr, (oy - scrollY) * dpr);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = cellColor(1, 0);
        ctx.fillRect(0, H, W, 1);
        ctx.globalAlpha = 1;
        drawParticles();
        drawNades();
        drawRockets();
        drawGuy();
        drawBullets();
        drawBeams();
        drawFlashes();
    }

    function drawParticles() {
        for (const q of parts) {
            if (q.type === DEBRIS) {
                ctx.fillStyle = cellColor(q.pal, q.shade);
                ctx.fillRect(Math.floor(q.x), Math.floor(q.y), 2, 2);
            } else if (q.type === SPARK) {
                ctx.fillStyle = q.color || '#ffd24a';
                ctx.fillRect(q.x, q.y, 1.5, 1.5);
            } else if (q.type === SHELL) {
                ctx.globalAlpha = Math.min(1, q.life * 3);
                ctx.fillStyle = '#d4a93a';
                ctx.fillRect(q.x, q.y, 2, 1);
                ctx.globalAlpha = 1;
            } else {
                const f = q.life / q.max;
                if (q.type === SMOKE) {
                    ctx.globalAlpha = 0.45 * f;
                    ctx.fillStyle = '#8a8a8a';
                    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
                } else {
                    const size = (q.size || 4) * (0.5 + f * 0.5);
                    ctx.globalAlpha = Math.min(1, f * 1.5);
                    ctx.fillStyle = f > 0.7 ? '#fff3b0' : f > 0.4 ? '#ff9a2a' : '#d0412b';
                    ctx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
                }
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawPixels(list) {
        for (const [x, y, c] of list) {
            ctx.fillStyle = c;
            ctx.fillRect(x, y, 4, 4);
        }
    }

    function drawGuy() {
        const g = guy;
        const pose = g.state === 'climb' ? 'climb' : g.state === 'chute' ? 'chute' : 'walk';
        let frame;
        if (pose === 'walk' && !g.grounded) frame = 1;
        else if (pose === 'chute') frame = Math.floor(performance.now() / 250) % 2;
        else frame = Math.floor(g.walk / 0.25) % 2;

        ctx.save();
        ctx.translate(Math.round(g.x), Math.round(g.y) - HEIGHT / 2);
        if (g.spin > 0) ctx.rotate((1 - g.spin / FLIP_TIME) * Math.PI * 2 * g.facing);
        if (g.facing < 0) ctx.scale(-1, 1);
        ctx.translate(-12, -HEIGHT / 2);
        if (pose === 'chute') {
            ctx.fillStyle = CANOPY_RED;
            for (const [x, y] of CANOPY) ctx.fillRect(x, y, 4, 4);
        }
        drawPixels(BODY);
        drawPixels(POSES[pose][frame]);
        ctx.restore();

        // the arm that holds the gun, then the gun, pointing wherever he's aiming
        const w = WEAPONS[weapon], p = gunPose();
        ctx.save();
        ctx.translate(p.s.x, p.s.y);
        ctx.rotate(p.a);
        if (p.flip < 0) ctx.scale(1, -1);
        ctx.fillStyle = SKIN;
        ctx.fillRect(-1, -2, p.reach + 2, 4);
        ctx.drawImage(gunSprites[weapon], p.reach - w.grip[0] * 2, -w.grip[1] * 2);
        if (muzzleFlash > 0) {
            const mx = p.reach + (w.muzzle[0] - w.grip[0]) * 2, my = (w.muzzle[1] - w.grip[1]) * 2;
            ctx.fillStyle = '#fff3b0';
            ctx.fillRect(mx, my - 3, 6, 6);
            ctx.fillStyle = '#ffb02a';
            ctx.fillRect(mx + 6, my - 1, 4, 2);
            ctx.fillRect(mx + 2, my - 5, 2, 10);
        }
        ctx.restore();
    }

    function drawBullets() {
        ctx.strokeStyle = '#ffcf40';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const b of bullets) {
            ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
    }

    function drawRockets() {
        for (const r of rockets) {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(Math.atan2(r.vy, r.vx));
            ctx.fillStyle = Math.random() < 0.5 ? '#ffb02a' : '#fff3b0';
            ctx.fillRect(-12, -1.5, 4, 3);
            ctx.fillStyle = gunColors.o;
            ctx.fillRect(-8, -2, 8, 4);
            ctx.fillStyle = '#d0412b';
            ctx.fillRect(0, -2, 3, 4);
            ctx.restore();
        }
    }

    function drawNades() {
        for (const n of nades) {
            ctx.save();
            ctx.translate(n.x, n.y - 3);
            ctx.rotate(n.spin);
            ctx.fillStyle = gunColors.o;
            ctx.fillRect(-3, -3, 6, 6);
            ctx.fillStyle = gunColors.l;
            ctx.fillRect(-1, -5, 2, 2);
            if (n.fuse < 0.6 && Math.floor(n.fuse * 12) % 2 === 0) {
                ctx.fillStyle = '#ff3b2a';
                ctx.fillRect(-1, -1, 2, 2);
            }
            ctx.restore();
        }
    }

    function drawBeams() {
        for (const b of beams) {
            const f = b.t / 0.3;
            ctx.globalAlpha = f;
            ctx.strokeStyle = '#36c6d9';
            ctx.lineWidth = 5 * f;
            ctx.beginPath();
            ctx.moveTo(b.x0, b.y0);
            ctx.lineTo(b.x1, b.y1);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5 * f;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawFlashes() {
        for (const f of flashes) {
            const k = f.t / f.life;
            ctx.globalAlpha = 1 - k;
            if (f.ring) {
                // shockwave
                ctx.strokeStyle = '#ffe26b';
                ctx.lineWidth = 3 * (1 - k);
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r * (0.5 + 2.2 * k), 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }
            ctx.fillStyle = '#ff9a2a';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.7 + k * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff3b0';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.45 + k * 0.3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // --------------------------------------------------------------------- loop

    // Keep him in the middle of the screen while he moves (and for a moment after,
    // to catch up), but leave the user free to scroll around while he stands still
    function followCamera(dt) {
        if (Math.abs(guy.vx) > 1 || Math.abs(guy.vy) > 1) camHold = 0.4;
        else if ((camHold -= dt) <= 0) return;
        const vh = window.innerHeight, sy = guy.y - HEIGHT / 2 - scrollY;
        let d = 0;
        if (sy < vh * 0.3) d = sy - vh * 0.3;
        else if (sy > vh * 0.7) d = sy - vh * 0.7;
        if (!d) return;
        let step = d * Math.min(1, dt * 8);
        if (Math.abs(step) < 1) step = Math.sign(step);
        window.scrollTo(window.scrollX, Math.round(scrollY + step));
    }

    function step(dt) {
        updateAim();
        updateGuy(dt);
        cooldown -= dt;
        nadeCooldown -= dt;
        muzzleFlash -= dt;
        if (firing && cooldown <= 0) fire();
        updateBullets(dt);
        updateRockets(dt);
        updateNades(dt);
        updateParticles(dt);
        for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].t -= dt) <= 0) beams.splice(i, 1);
        for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].t += dt) >= flashes[i].life) flashes.splice(i, 1);
        shakeAmt *= Math.exp(-dt * 10);
    }

    function frame(now) {
        if (!active) return;
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        acc += dt;
        scrollX = window.scrollX;
        scrollY = window.scrollY;
        flyRect = fly && fly.src.includes('fly.png') ? fly.getBoundingClientRect() : null;
        while (acc >= STEP) {
            step(STEP);
            acc -= STEP;
        }
        followCamera(dt);
        scrollX = window.scrollX;
        scrollY = window.scrollY;
        flushWorld();
        render();
        updatePct();
        raf = requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------------------- hud

    function buildHud() {
        hud = document.createElement('div');
        hud.id = 'destroy-hud';
        document.body.appendChild(hud);
        hud.addEventListener('click', e => {
            e.stopPropagation();   // keep the page's own click handler (flip / control toggle) out of it
            const b = e.target.closest('button');
            if (!b) return;
            b.blur();
            const act = b.dataset.act;
            if (act === 'weapon') selectWeapon(+b.dataset.w);
            else if (act === 'fix') holster();
            else if (act === 'gun') unholster();
            else if (act === 'mute') toggleMute();
            else if (act === 'help') toggleHelp();
        });
    }

    function toggleHelp() {
        helpOn = !helpOn;
        renderHud();
    }

    function renderHud() {
        if (!hud) return;
        hud.classList.toggle('dh-idle', !active);
        if (!active) {
            hud.innerHTML = `<button data-act="gun">[${coarsePointer ? 'tap' : 'g'}] give him the gun back</button>`;
            pctEl = muteEl = null;
            return;
        }
        const weapons = WEAPONS.map((w, i) =>
            `<button data-act="weapon" data-w="${i}"${i === weapon ? ' class="dh-on"' : ''}>${coarsePointer ? '' : i + 1 + ' '}${w.name}</button>`
        ).join(' ');
        const help = coarsePointer
            ? 'stick: move<br>&uarr;: jump, again to flip, hold to glide<br>tap: shoot<br>A: grenade<br>push into the screen edge: climb'
            : 'wasd: move<br>space: jump, again to flip, hold to glide<br>s: drop through<br>click: shoot<br>right-click or g: grenade<br>q: next weapon<br>run into the screen edge: climb';
        const key = k => coarsePointer ? '' : `[${k}] `;
        hud.innerHTML =
            `<div>${weapons}</div>` +
            `<div class="dh-pct"></div>` +
            (helpOn ? `<div class="dh-help">${help}</div>` : '') +
            `<div><button data-act="fix">${key('esc')}fix website</button> <button data-act="mute"></button> <button data-act="help">${key('h')}${helpOn ? 'hide help' : 'help'}</button></div>`;
        pctEl = hud.querySelector('.dh-pct');
        muteEl = hud.querySelector('[data-act="mute"]');
        muteEl.textContent = `${coarsePointer ? '' : '[m] '}sound ${audio.muted ? 'off' : 'on'}`;
        shownPct = -1;
        updatePct();
    }

    function updatePct() {
        if (!pctEl) return;
        const pct = solidTotal ? Math.min(100, solidRemoved / solidTotal * 100) : 0;
        const shown = Math.floor(pct * 10) / 10;
        if (shown === shownPct) return;
        shownPct = shown;
        pctEl.textContent = `website destroyed: ${shown.toFixed(1)}%${shown >= 90 ? ', you monster' : shown >= 50 ? ', yikes' : ''}`;
    }

    // ------------------------------------------------------------ start / stop

    function sizeView() {
        dpr = Math.min(window.devicePixelRatio || 1, 3);
        const vw = window.innerWidth, vh = window.innerHeight;
        view.width = Math.round(vw * dpr);
        view.height = Math.round(vh * dpr);
        view.style.width = vw + 'px';
        view.style.height = vh + 'px';
    }

    // (x, y) is where his feet go, in viewport coordinates
    async function start(x, y, chute = true) {
        if (active || starting) return;
        starting = true;
        const token = ++startToken;
        window.destroyMode = true;   // index.html's loop stands still from here
        initAudio();
        // Give a still-loading webfont a moment; if it lands later the world is redrawn
        if (document.fonts && document.fonts.status !== 'loaded') {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 300))]).catch(() => {});
        }
        if (token !== startToken) return;   // Esc was pressed while we waited
        starting = false;

        try {
            readPalette();
            rasterize();
        } catch (err) {
            window.destroyMode = false;
            throw err;
        }
        document.documentElement.classList.add('destroying');
        if (!view) {
            view = document.createElement('canvas');
            view.id = 'destroy-canvas';
            document.body.appendChild(view);
            ctx = view.getContext('2d');
        }
        view.style.display = 'block';
        sizeView();
        if (!hud) buildHud();
        fly = document.getElementById('fly-image');

        guy = newGuy(clamp(x + window.scrollX, EDGE, W - EDGE), clamp(y + window.scrollY, HEIGHT, H), chute);
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        beams = [];
        flashes = [];
        firing = false;
        cooldown = nadeCooldown = shakeAmt = 0;
        camHold = 0;
        releaseAll();
        active = true;
        renderHud();
        lastTime = performance.now();
        acc = 0;
        raf = requestAnimationFrame(frame);
    }

    // Put the website back and hand him back to index.html's loop where he stands
    function holster() {
        if (starting) {
            startToken++;
            starting = false;
            window.destroyMode = false;
            return;
        }
        if (!active) return;
        active = false;
        releaseAll();
        cancelAnimationFrame(raf);
        clearTimeout(rebuildTimer);
        // bring the text straight back rather than fading it in from transparent
        document.body.style.transition = 'none';
        document.documentElement.classList.remove('destroying');
        getComputedStyle(document.body).color;
        requestAnimationFrame(() => { document.body.style.transition = ''; });
        view.style.display = 'none';

        const person = document.getElementById('pixelated-person');
        const vw = window.innerWidth, vh = window.innerHeight;
        const x = clamp(guy.x - window.scrollX, EDGE, vw - EDGE);
        const bottom = clamp(vh - (guy.y - window.scrollY), 0, vh - 40);
        const dir = guy.facing > 0 ? 'right' : 'left';
        Object.assign(window, {
            personX: x, personY: bottom, direction: dir,
            isClimbing: false, isSwinging: false, isParachuting: bottom > 0, parachutingDirection: dir,
            keyboardControlled: true,
        });
        person.className = (bottom > 0 ? 'parachuting-' : 'person-') + dir + ' spawned';
        person.style.left = (x - 12) + 'px';
        person.style.bottom = bottom + 'px';
        person.style.top = 'auto';

        alp = pal = shade = kind = px32 = worldImg = worldCtx = worldCanvas = null;
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        beams = [];
        flashes = [];
        window.destroyMode = false;
        renderHud();
    }

    function unholster() {
        const person = document.getElementById('pixelated-person');
        if (active || starting || !person || !person.classList.contains('spawned')) return;
        start(window.personX, window.innerHeight - window.personY, window.personY > 0);
    }

    // A new width reflows the text, so rebuild the world to match (this repairs it)
    function rebuild() {
        if (!active) return;
        const x = guy.x - window.scrollX, y = guy.y - window.scrollY;
        rasterize();
        guy.x = clamp(x + window.scrollX, EDGE, W - EDGE);
        guy.y = clamp(y + window.scrollY, HEIGHT, H);
        guy.grounded = false;
        guy.state = 'air';
        bullets = [];
        rockets = [];
        nades = [];
        parts = [];
        shownPct = -1;
    }

    // ------------------------------------------------------------------- input

    const isUi = t => t && t.closest && t.closest('button, a, #destroy-hud, #virtual-joystick, #action-buttons, #lightbox-modal');

    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (!active) {
            if (e.code === 'KeyG') unholster();
            else if (e.code === 'Escape' && starting) holster();
            return;
        }
        const k = KEYS[e.code];
        if (k) {
            keys[k] = true;
            if (!e.repeat) tapped[k] = true;
            e.preventDefault();
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            return;
        }
        if (/^Digit[1-9]$/.test(e.code)) selectWeapon(+e.code.slice(5) - 1);
        else if (e.code === 'KeyQ') selectWeapon((weapon + 1) % WEAPONS.length);
        else if (e.code === 'KeyG') throwGrenade();
        else if (e.code === 'KeyM') toggleMute();
        else if (e.code === 'KeyH') toggleHelp();
        else if (e.code === 'Escape') holster();
    });

    document.addEventListener('keyup', e => {
        const k = KEYS[e.code];
        if (!k) return;
        keys[k] = false;
        if (active) e.preventDefault();
    });

    function releaseAll() {
        for (const k in keys) keys[k] = false;
        for (const k in tapped) tapped[k] = false;
        // index.html's own key state can get stuck the same way
        const kp = window.keysPressed;
        if (kp) for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) kp[k] = false;
        firing = false;
        pointer.touchId = null;
    }
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);

    // Only a real mouse aims by hovering; taps on buttons send fake mouse moves too
    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.has = true;
    }, { passive: true });

    window.addEventListener('mousedown', e => {
        if (!active || isUi(e.target)) return;
        const root = document.documentElement;
        if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) return;   // the scrollbar
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.has = true;
        initAudio();
        if (e.button === 0) firing = true;
        else if (e.button === 2) throwGrenade();
        e.preventDefault();
    });

    window.addEventListener('mouseup', e => {
        if (e.button === 0) firing = false;
    });

    window.addEventListener('contextmenu', e => {
        if (active && !isUi(e.target)) e.preventDefault();
    });

    // Touch: tap (and hold) anywhere that isn't a control to shoot at that spot
    document.addEventListener('touchstart', e => {
        if (!active) return;
        for (const t of e.changedTouches) {
            if (isUi(t.target)) continue;
            e.preventDefault();
            if (pointer.touchId !== null) continue;
            pointer.touchId = t.identifier;
            pointer.x = t.clientX;
            pointer.y = t.clientY;
            pointer.has = true;
            firing = true;
            initAudio();
        }
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (!active || pointer.touchId === null) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== pointer.touchId) continue;
            pointer.x = t.clientX;
            pointer.y = t.clientY;
            e.preventDefault();
        }
    }, { passive: false });

    function endTouch(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== pointer.touchId) continue;
            pointer.touchId = null;
            pointer.has = false;
            firing = false;
        }
    }
    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);

    const actionButton = document.getElementById('action-button');
    if (actionButton) actionButton.addEventListener('touchstart', () => throwGrenade());

    // index.html's joystick rewrites ArrowUp on every move, which would let go of a
    // jump button that's being held to glide, so track the button separately
    const jumpButton = document.getElementById('jump-button');
    if (jumpButton) {
        jumpButton.addEventListener('touchstart', () => {
            if (!active) return;
            keys.jump = true;
            tapped.jump = true;
        });
        jumpButton.addEventListener('touchend', () => { keys.jump = false; });
        jumpButton.addEventListener('touchcancel', () => { keys.jump = false; });
    }

    window.addEventListener('resize', () => {
        if (!active) return;
        sizeView();
        if (document.documentElement.clientWidth !== W) {
            clearTimeout(rebuildTimer);
            rebuildTimer = setTimeout(rebuild, 250);
        }
    });

    if (document.fonts) {
        document.fonts.addEventListener('loadingdone', () => {
            if (active && solidRemoved === 0) rebuild();
        });
    }

    // Recolour the world when the theme toggle is used mid-destruction
    new MutationObserver(() => {
        if (!active) return;
        readPalette();
        repaint();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.destroyGame = {
        start,
        stop: holster,
        // for poking at from the console
        get state() { return active ? { guy: { ...guy }, weapon: WEAPONS[weapon].name, W, H, solidTotal, solidRemoved, particles: parts.length } : null; },
    };
})();
