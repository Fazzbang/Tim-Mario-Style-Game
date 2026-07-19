(function () {
  "use strict";

  // ---------- Canvas & assets ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const CW = canvas.width;   // 360
  const CH = canvas.height;  // 640

  const images = {};
  function loadImage(key, src) {
    const img = new Image();
    img.src = src;
    images[key] = img;
    return img;
  }
  loadImage("player", "assets/player.png");
  loadImage("enemy", "assets/enemy.png");
  loadImage("background", "assets/background.jpg");
  loadImage("flag", "assets/flag.svg");
  loadImage("platformTile", "assets/platform-tile.png");

  // The platform tile art has a glowing top edge (the walkable surface) around 6.4% down
  // from its top, a solid rectangular stone body down to about 71.8%, and ragged moss
  // dangling past that toward the bottom - used as a decorative overhang under platforms.
  const TILE_GLOW_FRAC = 0.064;
  const TILE_SOLID_BOTTOM_FRAC = 0.718;
  // Same on-screen block size for both ground and platforms, so the stonework reads as one
  // consistent material instead of the ground's blocks looking blown up relative to platforms.
  const TILE_W = 64;
  const GROUND_FILL_COLOR = "#1b2033";

  // ---------- Physics constants ----------
  const GRAVITY = 0.9;
  const MOVE_SPEED = 2.6;
  const JUMP_VELOCITY = -15.5;
  const MAX_FALL = 16;
  const STOMP_BOUNCE = -9;
  const ENEMY_SPEED = 1.0;
  const MAX_JUMPS = 2; // ground jump + one mid-air double jump

  // Player sprite is a single static image (not a spritesheet), matched to its ~2:3 aspect ratio.
  const PLAYER_W = 28;
  const PLAYER_H = 42;
  // Enemy sprite is also a single static image, matched to its ~1.09:1 aspect ratio.
  const ENEMY_W = 32;
  const ENEMY_H = 29;

  // ---------- Game state ----------
  const STATE = { START: "start", PLAYING: "playing", DYING: "dying", LEVEL_COMPLETE: "level_complete", GAME_OVER: "game_over", WIN: "win" };
  let state = STATE.START;

  let levelIndex = 0;
  let level = null;
  let camX = 0;
  let score = 0;
  let lives = 3;
  let deathTimer = 0;
  let deathFlash = 0; // 0..1, drawn as a translucent red overlay that fades out after a hit

  let player = null;
  let enemies = [];

  const keys = { left: false, right: false, jump: false };
  let jumpHeld = false; // prevents holding jump from re-triggering every frame

  function makePlayer(start) {
    return {
      x: start.x, y: start.y, w: PLAYER_W, h: PLAYER_H,
      vx: 0, vy: 0, onGround: false, facing: 1,
      animTimer: 0, alive: true, jumpsUsed: 0,
    };
  }

  function loadLevel(idx) {
    level = LEVELS[idx];
    camX = 0;
    deathFlash = 0;
    player = makePlayer(level.playerStart);
    enemies = level.enemies.map((e) => ({
      x: e.x, y: e.y, w: ENEMY_W, h: ENEMY_H,
      vx: -ENEMY_SPEED, min: e.min, max: e.max, alive: true,
      animTimer: 0,
      dying: false, vy: 0, rotation: 0, rotSpeed: 0,
    }));
    document.getElementById("hud-level").textContent = level.name;
  }

  function resetGame() {
    levelIndex = 0;
    score = 0;
    lives = 3;
    loadLevel(levelIndex);
    updateHud();
  }

  function updateHud() {
    document.getElementById("hud-lives").textContent = "❤ x" + lives;
    document.getElementById("hud-score").textContent = score;
  }

  // ---------- Solids (ground segments + platforms) ----------
  function groundSegments() {
    // Build solid ground rects by subtracting pits from the full-width strip.
    const segs = [];
    let cursor = 0;
    const pits = level.pits.slice().sort((a, b) => a.x - b.x);
    for (const p of pits) {
      if (p.x > cursor) segs.push({ x: cursor, y: level.groundY, w: p.x - cursor, h: level.groundH });
      cursor = p.x + p.w;
    }
    if (cursor < level.width) segs.push({ x: cursor, y: level.groundY, w: level.width - cursor, h: level.groundH });
    return segs;
  }

  let solids = [];

  function rebuildSolids() {
    solids = groundSegments().concat(level.platforms);
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Input ----------
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") keys.jump = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") keys.jump = false;
  });

  function bindHold(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up, { passive: false });
    el.addEventListener("mousedown", down);
    el.addEventListener("mouseup", up);
    el.addEventListener("mouseleave", up);
  }

  bindHold(document.getElementById("btn-left"), () => (keys.left = true), () => (keys.left = false));
  bindHold(document.getElementById("btn-right"), () => (keys.right = true), () => (keys.right = false));
  bindHold(document.getElementById("btn-jump"), () => (keys.jump = true), () => (keys.jump = false));

  document.getElementById("start-btn").addEventListener("click", () => {
    document.getElementById("overlay").classList.remove("show");
    resetGame();
    state = STATE.PLAYING;
  });

  // ---------- Update ----------
  function updatePlayer() {
    if (keys.left && !keys.right) {
      player.vx = -MOVE_SPEED;
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx = MOVE_SPEED;
      player.facing = 1;
    } else {
      player.vx = 0;
    }

    if (keys.jump && !jumpHeld && player.jumpsUsed < MAX_JUMPS) {
      player.vy = JUMP_VELOCITY;
      player.jumpsUsed++;
      player.onGround = false;
    }
    jumpHeld = keys.jump;

    player.vy += GRAVITY;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    // horizontal move + collide
    player.x += player.vx;
    player.x = Math.max(0, Math.min(player.x, level.width - player.w));
    for (const s of solids) {
      if (aabb(player, s)) {
        if (player.vx > 0) player.x = s.x - player.w;
        else if (player.vx < 0) player.x = s.x + s.w;
      }
    }

    // vertical move + collide
    const prevBottom = player.y + player.h;
    player.prevBottom = prevBottom;
    player.y += player.vy;
    player.onGround = false;
    for (const s of solids) {
      if (aabb(player, s)) {
        if (player.vy > 0 && prevBottom <= s.y + 1) {
          player.y = s.y - player.h;
          player.vy = 0;
          player.onGround = true;
          player.jumpsUsed = 0;
        } else if (player.vy < 0) {
          player.y = s.y + s.h;
          player.vy = 0;
        }
      }
    }

    // walk bob: single static sprite, so animate a small bounce instead of frame-swapping
    if (player.onGround && player.vx !== 0) {
      player.animTimer += 0.35;
    }

    // fell in a pit / off the world
    if (player.y > CH + 100) {
      killPlayer(false);
      return;
    }

    // reached the goal flag
    if (player.x + player.w > level.goalX) {
      state = STATE.LEVEL_COMPLETE;
    }
  }

  function updateEnemies() {
    for (const en of enemies) {
      if (!en.alive) continue;

      if (en.dying) {
        // Defeated enemies tumble off the map instead of just vanishing.
        en.vy += GRAVITY;
        en.y += en.vy;
        en.rotation += en.rotSpeed;
        if (en.y > CH + 150) en.alive = false;
        continue;
      }

      en.x += en.vx;
      if (en.x <= en.min) { en.x = en.min; en.vx = ENEMY_SPEED; }
      if (en.x + en.w >= en.max) { en.x = en.max - en.w; en.vx = -ENEMY_SPEED; }
      en.animTimer += 0.25;

      // Enemies only affect the player on actual contact (AABB overlap) - never at a distance.
      if (player.alive && aabb(player, en)) {
        const stomping = player.vy > 0 && player.prevBottom <= en.y + 8;
        if (stomping) {
          en.dying = true;
          en.vy = -6;
          en.rotSpeed = (en.x < player.x ? -1 : 1) * 0.3;
          player.vy = STOMP_BOUNCE;
          score += 100;
          updateHud();
        } else {
          killPlayer(true, en);
          return;
        }
      }
    }
    enemies = enemies.filter((e) => e.alive);
  }

  // Death is a brief visible sequence, not an instant reset: the player is knocked back/up,
  // ignores collision, and falls off the bottom of the screen before the respawn actually happens.
  function killPlayer(fromEnemy, enemy) {
    if (state !== STATE.PLAYING) return;
    player.alive = false;
    state = STATE.DYING;
    deathTimer = 0;
    deathFlash = 1;
    player.vy = -10;
    if (fromEnemy && enemy) {
      player.vx = player.x < enemy.x ? -3 : 3;
    } else {
      player.vx = 0;
    }
  }

  function updateDeathSequence() {
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    deathTimer++;
    if (deathFlash > 0) deathFlash = Math.max(0, deathFlash - 0.05);
    if (player.y > CH + 150 || deathTimer > 90) {
      finishDeath();
    }
  }

  function finishDeath() {
    lives--;
    updateHud();
    if (lives <= 0) {
      state = STATE.GAME_OVER;
    } else {
      loadLevel(levelIndex);
      state = STATE.PLAYING;
    }
  }

  function updateCamera() {
    const target = player.x - CW / 2;
    camX = Math.max(0, Math.min(target, level.width - CW));
  }

  function update() {
    if (state === STATE.DYING) {
      updateDeathSequence();
      updateCamera();
      return;
    }
    if (state !== STATE.PLAYING) return;
    updatePlayer();
    if (state !== STATE.PLAYING) return;
    updateEnemies();
    if (state !== STATE.PLAYING) return;
    updateCamera();
  }

  // ---------- Render ----------
  function drawBackground() {
    const bg = images.background;
    if (!bg.complete || bg.naturalWidth === 0) {
      ctx.fillStyle = "#0c0f1f";
      ctx.fillRect(0, 0, CW, CH);
      return;
    }
    // This background is one composed scene (not a repeating texture), so instead of
    // tiling it we pan its full width across the full level - the camera's 0..1 progress
    // through the level maps to the image's 0..1 pan range, arriving at the castle by the goal.
    const bgW = bg.naturalWidth * (CH / bg.naturalHeight);
    const maxCamX = Math.max(1, level.width - CW);
    const maxBgPan = Math.max(0, bgW - CW);
    const offset = -((camX / maxCamX) * maxBgPan);
    ctx.drawImage(bg, offset, 0, bgW, CH);
  }

  function drawGround() {
    const tile = images.platformTile;
    const hasTile = tile.complete && tile.naturalWidth > 0;
    for (const s of groundSegments()) {
      const sx = s.x - camX;
      if (sx + s.w < 0 || sx > CW) continue;
      if (!hasTile) {
        ctx.fillStyle = "#3a3a42";
        ctx.fillRect(sx, s.y, s.w, s.h);
        ctx.fillStyle = "#4d5a45";
        ctx.fillRect(sx, s.y, s.w, 8);
        continue;
      }
      // Ground uses the same block scale as platforms (so the stonework looks like one
      // material) for a single surface row, then a solid fill for the earth beneath it.
      const iw = tile.naturalWidth, ih = tile.naturalHeight;
      const srcY = ih * TILE_GLOW_FRAC;
      const srcH = ih * (TILE_SOLID_BOTTOM_FRAC - TILE_GLOW_FRAC);
      const scale = TILE_W / iw;
      const rowH = srcH * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, s.y, s.w, s.h);
      ctx.clip();
      ctx.fillStyle = GROUND_FILL_COLOR;
      ctx.fillRect(sx, s.y, s.w, s.h);
      for (let x = sx; x < sx + s.w; x += TILE_W) {
        ctx.drawImage(tile, 0, srcY, iw, srcH, x, s.y, TILE_W, rowH);
      }
      ctx.restore();
    }
  }

  function drawPlatforms() {
    const tile = images.platformTile;
    const hasTile = tile.complete && tile.naturalWidth > 0;
    for (const p of level.platforms) {
      const sx = p.x - camX;
      if (sx + p.w < 0 || sx > CW) continue;
      if (!hasTile) {
        ctx.fillStyle = "#4a4438";
        ctx.fillRect(sx, p.y, p.w, p.h);
        ctx.fillStyle = "#4d5a45";
        ctx.fillRect(sx, p.y, p.w, 6);
        continue;
      }
      // Platforms show the full tile - glowing top edge lined up with the walkable
      // surface (p.y), stone body through the hitbox, and mossy roots dangling
      // decoratively below it into open air.
      const iw = tile.naturalWidth, ih = tile.naturalHeight;
      const scale = TILE_W / iw;
      const tileH = ih * scale;
      const drawY = p.y - ih * TILE_GLOW_FRAC * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, p.w, CH);
      ctx.clip();
      for (let x = sx; x < sx + p.w; x += TILE_W) {
        ctx.drawImage(tile, x, drawY, TILE_W, tileH);
      }
      ctx.restore();
    }
  }

  function drawGoal() {
    const flag = images.flag;
    const sx = level.goalX - camX;
    if (sx + 40 < 0 || sx > CW) return;
    if (flag.complete && flag.naturalWidth > 0) {
      ctx.drawImage(flag, sx, level.groundY - 160, 40, 160);
    } else {
      ctx.fillStyle = "#e53935";
      ctx.fillRect(sx, level.groundY - 160, 6, 160);
    }
  }

  function drawEnemies() {
    const spr = images.enemy;
    for (const en of enemies) {
      const sx = en.x - camX;
      if (sx + en.w < 0 || sx > CW) continue;
      const hasSprite = spr.complete && spr.naturalWidth > 0;

      if (en.dying) {
        // Tumble off the map: rotate around the enemy's own center as it falls.
        ctx.save();
        ctx.translate(sx + en.w / 2, en.y + en.h / 2);
        ctx.rotate(en.rotation);
        if (hasSprite) {
          ctx.drawImage(spr, -en.w / 2, -en.h / 2, en.w, en.h);
        } else {
          ctx.fillStyle = "#8b5a2b";
          ctx.fillRect(-en.w / 2, -en.h / 2, en.w, en.h);
        }
        ctx.restore();
        continue;
      }

      const bob = Math.abs(Math.sin(en.animTimer)) * 2;
      const facingLeft = en.vx < 0;
      if (!hasSprite) {
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(sx, en.y - bob, en.w, en.h);
        continue;
      }
      ctx.save();
      if (facingLeft) {
        ctx.translate(sx + en.w, en.y - bob);
        ctx.scale(-1, 1);
        ctx.drawImage(spr, 0, 0, en.w, en.h);
      } else {
        ctx.drawImage(spr, sx, en.y - bob, en.w, en.h);
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    const spr = images.player;
    const sx = player.x - camX;
    const bob = player.onGround && player.vx !== 0 ? Math.abs(Math.sin(player.animTimer)) * 3 : 0;
    ctx.save();
    if (spr.complete && spr.naturalWidth > 0) {
      if (player.facing === -1) {
        ctx.translate(sx + player.w, player.y - bob);
        ctx.scale(-1, 1);
        ctx.drawImage(spr, 0, 0, player.w, player.h);
      } else {
        ctx.drawImage(spr, sx, player.y - bob, player.w, player.h);
      }
    } else {
      ctx.fillStyle = "#d32f2f";
      ctx.fillRect(sx, player.y, player.w, player.h);
    }
    ctx.restore();
  }

  function drawMessage(lines, buttonText) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(lines[0], CW / 2, CH / 2 - 30);
    ctx.font = "16px sans-serif";
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], CW / 2, CH / 2 + (i - 1) * 24);
    }
    if (buttonText) {
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#ffca28";
      ctx.fillText(buttonText, CW / 2, CH / 2 + 90);
    }
  }

  function render() {
    ctx.clearRect(0, 0, CW, CH);
    if (!level) return;
    drawBackground();
    drawGround();
    drawPlatforms();
    drawGoal();
    drawEnemies();
    drawPlayer();

    if (deathFlash > 0) {
      ctx.fillStyle = `rgba(170, 0, 0, ${deathFlash * 0.5})`;
      ctx.fillRect(0, 0, CW, CH);
    }
    if (state === STATE.DYING) {
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("You Died", CW / 2, 110);
    }

    if (state === STATE.LEVEL_COMPLETE) {
      drawMessage(["Level Complete!", "Score: " + score], "Tap to continue");
    } else if (state === STATE.GAME_OVER) {
      drawMessage(["Game Over", "Score: " + score], "Tap to retry");
    } else if (state === STATE.WIN) {
      drawMessage(["You Win!", "Final Score: " + score], "Tap to play again");
    }
  }

  // Advance from LEVEL_COMPLETE / GAME_OVER / WIN on tap or jump press
  function handleAdvance() {
    if (state === STATE.LEVEL_COMPLETE) {
      levelIndex++;
      if (levelIndex >= LEVELS.length) {
        state = STATE.WIN;
      } else {
        loadLevel(levelIndex);
        state = STATE.PLAYING;
      }
    } else if (state === STATE.GAME_OVER || state === STATE.WIN) {
      resetGame();
      state = STATE.PLAYING;
    }
  }
  canvas.addEventListener("touchstart", handleAdvance, { passive: true });
  canvas.addEventListener("mousedown", handleAdvance);

  // ---------- Main loop ----------
  let lastTime = performance.now();
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    // fixed-step-ish update; physics tuned for ~60fps, clamp to avoid huge jumps on tab-out
    const steps = Math.min(3, Math.max(1, Math.round(dt / 16.67)));
    for (let i = 0; i < steps; i++) {
      if (level) rebuildSolids();
      update();
    }
    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
