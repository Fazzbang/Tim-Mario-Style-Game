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
  loadImage("player", "assets/player.svg");
  loadImage("enemy", "assets/enemy.svg");
  loadImage("background", "assets/background.svg");
  loadImage("flag", "assets/flag.svg");

  // ---------- Physics constants ----------
  const GRAVITY = 0.9;
  const MOVE_SPEED = 2.6;
  const JUMP_VELOCITY = -15.5;
  const MAX_FALL = 16;
  const STOMP_BOUNCE = -9;
  const ENEMY_SPEED = 1.0;

  const PLAYER_W = 26;
  const PLAYER_H = 42;
  const ENEMY_W = 26;
  const ENEMY_H = 26;

  // ---------- Game state ----------
  const STATE = { START: "start", PLAYING: "playing", LEVEL_COMPLETE: "level_complete", GAME_OVER: "game_over", WIN: "win" };
  let state = STATE.START;

  let levelIndex = 0;
  let level = null;
  let camX = 0;
  let score = 0;
  let lives = 3;

  let player = null;
  let enemies = [];
  let squashes = []; // brief squash effect markers { x, y, timer }

  const keys = { left: false, right: false, jump: false };
  let jumpHeld = false; // prevents holding jump from re-triggering every frame

  function makePlayer(start) {
    return {
      x: start.x, y: start.y, w: PLAYER_W, h: PLAYER_H,
      vx: 0, vy: 0, onGround: false, facing: 1,
      animFrame: 0, animTimer: 0, alive: true,
    };
  }

  function loadLevel(idx) {
    level = LEVELS[idx];
    camX = 0;
    player = makePlayer(level.playerStart);
    enemies = level.enemies.map((e) => ({
      x: e.x, y: e.y, w: ENEMY_W, h: ENEMY_H,
      vx: -ENEMY_SPEED, min: e.min, max: e.max, alive: true,
      animFrame: 0, animTimer: 0,
    }));
    squashes = [];
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

    if (keys.jump && player.onGround && !jumpHeld) {
      player.vy = JUMP_VELOCITY;
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
        } else if (player.vy < 0) {
          player.y = s.y + s.h;
          player.vy = 0;
        }
      }
    }

    // animation
    if (!player.onGround) {
      player.animFrame = 3; // jump frame
    } else if (player.vx !== 0) {
      player.animTimer++;
      if (player.animTimer > 8) {
        player.animTimer = 0;
        player.animFrame = player.animFrame === 1 ? 2 : 1;
      }
    } else {
      player.animFrame = 0;
    }

    // fell in a pit / off the world
    if (player.y > CH + 100) {
      loseLife();
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
      en.x += en.vx;
      if (en.x <= en.min) { en.x = en.min; en.vx = ENEMY_SPEED; }
      if (en.x + en.w >= en.max) { en.x = en.max - en.w; en.vx = -ENEMY_SPEED; }

      en.animTimer++;
      if (en.animTimer > 14) {
        en.animTimer = 0;
        en.animFrame = en.animFrame === 0 ? 1 : 0;
      }

      if (player.alive && aabb(player, en)) {
        const stomping = player.vy > 0 && player.prevBottom <= en.y + 8;
        if (stomping) {
          en.alive = false;
          player.vy = STOMP_BOUNCE;
          score += 100;
          squashes.push({ x: en.x, y: en.y + en.h - 8, timer: 18 });
          updateHud();
        } else {
          loseLife();
          return;
        }
      }
    }
    enemies = enemies.filter((e) => e.alive);
  }

  function loseLife() {
    lives--;
    updateHud();
    if (lives <= 0) {
      state = STATE.GAME_OVER;
    } else {
      loadLevel(levelIndex);
    }
  }

  function updateCamera() {
    const target = player.x - CW / 2;
    camX = Math.max(0, Math.min(target, level.width - CW));
  }

  function update() {
    if (state !== STATE.PLAYING) return;
    updatePlayer();
    if (state !== STATE.PLAYING) return;
    updateEnemies();
    if (state !== STATE.PLAYING) return;
    updateCamera();
    squashes.forEach((s) => s.timer--);
    squashes = squashes.filter((s) => s.timer > 0);
  }

  // ---------- Render ----------
  function drawBackground() {
    const bg = images.background;
    if (!bg.complete || bg.naturalWidth === 0) {
      ctx.fillStyle = "#8fd6ff";
      ctx.fillRect(0, 0, CW, CH);
      return;
    }
    const bgW = bg.naturalWidth * (CH / bg.naturalHeight);
    const offset = -((camX * 0.35) % bgW);
    let x = offset;
    while (x < CW) {
      ctx.drawImage(bg, x, 0, bgW, CH);
      x += bgW;
    }
  }

  function drawGround() {
    for (const s of groundSegments()) {
      const sx = s.x - camX;
      if (sx + s.w < 0 || sx > CW) continue;
      ctx.fillStyle = "#6d4c2b";
      ctx.fillRect(sx, s.y, s.w, s.h);
      ctx.fillStyle = "#5fb562";
      ctx.fillRect(sx, s.y, s.w, 8);
    }
  }

  function drawPlatforms() {
    for (const p of level.platforms) {
      const sx = p.x - camX;
      if (sx + p.w < 0 || sx > CW) continue;
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(sx, p.y, p.w, p.h);
      ctx.fillStyle = "#5fb562";
      ctx.fillRect(sx, p.y, p.w, 6);
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
      if (spr.complete && spr.naturalWidth > 0) {
        ctx.drawImage(spr, en.animFrame * 28, 0, 28, 28, sx, en.y, en.w, en.h);
      } else {
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(sx, en.y, en.w, en.h);
      }
    }
    for (const s of squashes) {
      const sx = s.x - camX;
      ctx.fillStyle = "#6d4c2b";
      ctx.fillRect(sx, s.y, ENEMY_W, 6);
    }
  }

  function drawPlayer() {
    const spr = images.player;
    const sx = player.x - camX;
    ctx.save();
    if (spr.complete && spr.naturalWidth > 0) {
      if (player.facing === -1) {
        ctx.translate(sx + player.w, player.y);
        ctx.scale(-1, 1);
        ctx.drawImage(spr, player.animFrame * 32, 0, 32, 48, 0, 0, player.w, player.h);
      } else {
        ctx.drawImage(spr, player.animFrame * 32, 0, 32, 48, sx, player.y, player.w, player.h);
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
