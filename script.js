'use strict';

// =====================================================
// Constants
// =====================================================
const COLS = 10;
const ROWS = 20;
const HIDDEN_ROWS = 2; // rows above visible area for spawn

// Tetromino definitions: each shape is a 4x4 matrix (flat array, 1=filled)
const TETROMINOES = {
  I: {
    color: '#00d4ff',
    shapes: [
      [0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      [0,0,0,0, 0,0,0,0, 1,1,1,1, 0,0,0,0],
      [0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0],
    ]
  },
  O: {
    color: '#ffd700',
    shapes: [
      [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
    ]
  },
  T: {
    color: '#aa44ff',
    shapes: [
      [0,1,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,1,0,0, 0,1,1,0, 0,1,0,0, 0,0,0,0],
      [0,0,0,0, 1,1,1,0, 0,1,0,0, 0,0,0,0],
      [0,1,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0],
    ]
  },
  S: {
    color: '#44ff44',
    shapes: [
      [0,1,1,0, 1,1,0,0, 0,0,0,0, 0,0,0,0],
      [0,1,0,0, 0,1,1,0, 0,0,1,0, 0,0,0,0],
      [0,0,0,0, 0,1,1,0, 1,1,0,0, 0,0,0,0],
      [1,0,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0],
    ]
  },
  Z: {
    color: '#ff4444',
    shapes: [
      [1,1,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,0,1,0, 0,1,1,0, 0,1,0,0, 0,0,0,0],
      [0,0,0,0, 1,1,0,0, 0,1,1,0, 0,0,0,0],
      [0,1,0,0, 1,1,0,0, 1,0,0,0, 0,0,0,0],
    ]
  },
  J: {
    color: '#4488ff',
    shapes: [
      [1,0,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,1,1,0, 0,1,0,0, 0,1,0,0, 0,0,0,0],
      [0,0,0,0, 1,1,1,0, 0,0,1,0, 0,0,0,0],
      [0,1,0,0, 0,1,0,0, 1,1,0,0, 0,0,0,0],
    ]
  },
  L: {
    color: '#ff8800',
    shapes: [
      [0,0,1,0, 1,1,1,0, 0,0,0,0, 0,0,0,0],
      [0,1,0,0, 0,1,0,0, 0,1,1,0, 0,0,0,0],
      [0,0,0,0, 1,1,1,0, 1,0,0,0, 0,0,0,0],
      [1,1,0,0, 0,1,0,0, 0,1,0,0, 0,0,0,0],
    ]
  },
};

const PIECE_KEYS = Object.keys(TETROMINOES);

// Scoring table (lines cleared at once)
const LINE_SCORES = [0, 100, 300, 500, 800];

// Drop interval per level (ms)
function dropInterval(level) {
  return Math.max(80, 1000 - (level - 1) * 80);
}

// =====================================================
// Bag randomizer (7-bag)
// =====================================================
class Bag {
  constructor() { this.bag = []; }
  next() {
    if (this.bag.length === 0) {
      this.bag = [...PIECE_KEYS].sort(() => Math.random() - 0.5);
    }
    return this.bag.pop();
  }
}

// =====================================================
// Board
// =====================================================
class Board {
  constructor() {
    this.grid = this._emptyGrid();
  }
  _emptyGrid() {
    return Array.from({ length: ROWS + HIDDEN_ROWS }, () => Array(COLS).fill(null));
  }
  reset() { this.grid = this._emptyGrid(); }

  isValid(shape, row, col) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!shape[r * 4 + c]) continue;
        const br = row + r;
        const bc = col + c;
        if (bc < 0 || bc >= COLS) return false;
        if (br >= ROWS + HIDDEN_ROWS) return false;
        if (br >= 0 && this.grid[br][bc]) return false;
      }
    }
    return true;
  }

  lock(piece) {
    const { shape, color, row, col } = piece;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!shape[r * 4 + c]) continue;
        const br = row + r;
        const bc = col + c;
        if (br >= 0) this.grid[br][bc] = color;
      }
    }
  }

  clearLines() {
    let cleared = 0;
    for (let r = ROWS + HIDDEN_ROWS - 1; r >= 0; r--) {
      if (this.grid[r].every(cell => cell !== null)) {
        this.grid.splice(r, 1);
        this.grid.unshift(Array(COLS).fill(null));
        cleared++;
        r++; // re-check same row index
      }
    }
    return cleared;
  }
}

// =====================================================
// Piece
// =====================================================
class Piece {
  constructor(key) {
    this.key = key;
    this.def = TETROMINOES[key];
    this.color = this.def.color;
    this.rotation = 0;
    this.shape = this.def.shapes[0];
    // Spawn position
    this.row = 0; // inside HIDDEN_ROWS area
    this.col = 3;
  }
  get currentShape() { return this.def.shapes[this.rotation]; }
  rotate(dir) {
    const len = this.def.shapes.length;
    this.rotation = (this.rotation + dir + len) % len;
    this.shape = this.def.shapes[this.rotation];
  }
}

// =====================================================
// Ghost piece helper
// =====================================================
function ghostRow(board, piece) {
  let r = piece.row;
  while (board.isValid(piece.shape, r + 1, piece.col)) r++;
  return r;
}

// =====================================================
// Renderer
// =====================================================
class Renderer {
  constructor(gameCanvas, nextCanvas) {
    this.gc = gameCanvas;
    this.nc = nextCanvas;
    this.ctx = gameCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.cellSize = 30;
  }

  resize(cellSize) {
    this.cellSize = cellSize;
    this.gc.width = COLS * cellSize;
    this.gc.height = ROWS * cellSize;
  }

  _drawCell(ctx, x, y, size, color, ghost = false) {
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
      ctx.globalAlpha = 1;
      return;
    }
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    // Highlight top-left
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 1, y + 1, size - 2, 4);
    ctx.fillRect(x + 1, y + 1, 4, size - 2);
    // Shadow bottom-right
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 1, y + size - 5, size - 2, 4);
    ctx.fillRect(x + size - 5, y + 1, 4, size - 2);
    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }

  drawBoard(board, piece) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const visibleRows = ROWS;
    const offset = HIDDEN_ROWS;

    // Background
    ctx.fillStyle = '#000014';
    ctx.fillRect(0, 0, this.gc.width, this.gc.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= visibleRows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cs);
      ctx.lineTo(COLS * cs, r * cs);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cs, 0);
      ctx.lineTo(c * cs, visibleRows * cs);
      ctx.stroke();
    }

    // Locked cells (only visible rows)
    for (let r = 0; r < visibleRows; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = board.grid[r + offset][c];
        if (color) {
          this._drawCell(ctx, c * cs, r * cs, cs, color);
        }
      }
    }

    // Ghost piece
    if (piece) {
      const gr = ghostRow(board, piece);
      if (gr !== piece.row) {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            if (!piece.shape[r * 4 + c]) continue;
            const br = gr + r - offset;
            const bc = piece.col + c;
            if (br >= 0 && br < visibleRows) {
              this._drawCell(ctx, bc * cs, br * cs, cs, piece.color, true);
            }
          }
        }
      }
    }

    // Active piece
    if (piece) {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (!piece.shape[r * 4 + c]) continue;
          const br = piece.row + r - offset;
          const bc = piece.col + c;
          if (br >= 0 && br < visibleRows) {
            this._drawCell(ctx, bc * cs, br * cs, cs, piece.color);
          }
        }
      }
    }
  }

  drawNext(piece) {
    const ctx = this.nctx;
    const nc = this.nc;
    const cs = 24; // fixed cell size for next preview
    ctx.clearRect(0, 0, nc.width, nc.height);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, nc.width, nc.height);
    if (!piece) return;

    // Find bounding box of shape
    const s = piece.currentShape;
    let minR = 4, maxR = -1, minC = 4, maxC = -1;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (s[r * 4 + c]) {
          minR = Math.min(minR, r); maxR = Math.max(maxR, r);
          minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        }
      }
    }
    const pw = (maxC - minC + 1) * cs;
    const ph = (maxR - minR + 1) * cs;
    const ox = Math.floor((nc.width - pw) / 2) - minC * cs;
    const oy = Math.floor((nc.height - ph) / 2) - minR * cs;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (s[r * 4 + c]) {
          this._drawCell(ctx, ox + c * cs, oy + r * cs, cs, piece.color);
        }
      }
    }
  }
}

// =====================================================
// Game
// =====================================================
class Game {
  constructor() {
    this.board = new Board();
    this.bag = new Bag();
    this.renderer = null;
    this.piece = null;
    this.nextPiece = null;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.state = 'idle'; // idle | playing | paused | gameover
    this._dropTimer = null;
    this._lastDrop = 0;
    this._rafId = null;
    this._lockDelay = 0;
    this._lockDelayMax = 500;
    this._isOnGround = false;

    this._initDOM();
    this._initRenderer();
    this._initInput();
    this._showOverlay('TETRIS', '', 'START');
  }

  // ---- DOM references ----
  _initDOM() {
    this.elScore = document.getElementById('score');
    this.elLevel = document.getElementById('level');
    this.elLines = document.getElementById('lines');
    this.elOverlay = document.getElementById('overlay');
    this.elOverlayTitle = document.getElementById('overlay-title');
    this.elOverlayScore = document.getElementById('overlay-score-display');
    this.elOverlayBtn = document.getElementById('overlay-btn');
    this.gameCanvas = document.getElementById('game-canvas');
    this.nextCanvas = document.getElementById('next-canvas');

    this.elOverlayBtn.addEventListener('click', () => this._handleOverlayBtn());
    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-restart').addEventListener('click', () => this.restart());
  }

  // ---- Renderer + sizing ----
  _initRenderer() {
    this.renderer = new Renderer(this.gameCanvas, this.nextCanvas);
    this._updateSize();
    window.addEventListener('resize', () => this._updateSize());
  }

  _updateSize() {
    const wrapper = document.getElementById('canvas-wrapper');
    const main = document.getElementById('main');
    const sidePanel = document.getElementById('side-panel');
    const controls = document.getElementById('mobile-controls');
    const header = document.getElementById('header');

    const headerH = header.offsetHeight;
    const controlsH = controls.offsetHeight;
    const availH = window.innerHeight - headerH - controlsH - 20; // 20 = padding+gap
    const availW = main.offsetWidth - sidePanel.offsetWidth - 20;

    // Cell size from both dimensions
    const cellByH = Math.floor(availH / ROWS);
    const cellByW = Math.floor(availW / COLS);
    const cs = Math.max(16, Math.min(cellByH, cellByW));

    this.renderer.resize(cs);
    wrapper.style.width = (COLS * cs) + 'px';
    wrapper.style.height = (ROWS * cs) + 'px';

    this._render();
  }

  // ---- Input ----
  _initInput() {
    // Keyboard
    document.addEventListener('keydown', e => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','KeyP','KeyR'].includes(e.code)) {
        e.preventDefault();
      }
      if (this.state === 'playing') {
        switch (e.code) {
          case 'ArrowLeft':  this._move(-1); break;
          case 'ArrowRight': this._move(1); break;
          case 'ArrowDown':  this._softDrop(); break;
          case 'ArrowUp':    this._rotate(1); break;
          case 'Space':      this._hardDrop(); break;
          case 'KeyP':       this.togglePause(); break;
          case 'KeyR':       this.restart(); break;
        }
      } else if (this.state === 'paused') {
        if (e.code === 'KeyP') this.togglePause();
        if (e.code === 'KeyR') this.restart();
      } else {
        if (e.code === 'Space' || e.code === 'Enter') this._handleOverlayBtn();
      }
    });

    // Mobile buttons
    this._bindBtn('btn-left',   () => this._move(-1));
    this._bindBtn('btn-right',  () => this._move(1));
    this._bindBtn('btn-soft',   () => this._softDrop());
    this._bindBtn('btn-rotate', () => this._rotate(1));
    this._bindBtn('btn-hard',   () => this._hardDrop());

    // Swipe on game canvas
    this._initSwipe();
  }

  _bindBtn(id, action) {
    const btn = document.getElementById(id);
    if (!btn) return;

    let repeatTimer = null;
    let repeatDelay = null;
    const START_DELAY = 180;
    const REPEAT_DELAY = 80;

    const start = (e) => {
      e.preventDefault();
      if (this.state !== 'playing') return;
      btn.classList.add('pressed');
      action();
      repeatDelay = setTimeout(() => {
        repeatTimer = setInterval(action, REPEAT_DELAY);
      }, START_DELAY);
    };
    const stop = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      clearTimeout(repeatDelay);
      clearInterval(repeatTimer);
    };

    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', stop, { passive: false });
    btn.addEventListener('touchcancel', stop, { passive: false });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
  }

  _initSwipe() {
    let startX = 0, startY = 0, startTime = 0;
    const wrapper = document.getElementById('canvas-wrapper');
    const TAP_MAX_DIST = 15;
    const SWIPE_MIN_DIST = 30;
    const SWIPE_TIME_MAX = 400;

    wrapper.addEventListener('touchstart', e => {
      if (this.state !== 'playing') return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; startTime = Date.now();
    }, { passive: true });

    wrapper.addEventListener('touchend', e => {
      if (this.state !== 'playing') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startTime;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < TAP_MAX_DIST && dt < 250) {
        // Tap = rotate
        this._rotate(1);
        return;
      }
      if (dt > SWIPE_TIME_MAX) return;
      if (dist < SWIPE_MIN_DIST) return;

      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax > ay) {
        // Horizontal swipe
        this._move(dx > 0 ? 1 : -1);
      } else {
        // Vertical swipe
        if (dy > 0) {
          this._softDrop();
        } else {
          this._hardDrop();
        }
      }
    }, { passive: true });
  }

  // ---- Overlay ----
  _showOverlay(title, scoreText, btnLabel) {
    this.elOverlayTitle.textContent = title;
    this.elOverlayScore.textContent = scoreText;
    this.elOverlayBtn.textContent = btnLabel;
    this.elOverlay.classList.remove('hidden');
  }
  _hideOverlay() {
    this.elOverlay.classList.add('hidden');
  }
  _handleOverlayBtn() {
    if (this.state === 'idle' || this.state === 'gameover') {
      this.start();
    }
  }

  // ---- Game lifecycle ----
  start() {
    this.board.reset();
    this.score = 0; this.level = 1; this.lines = 0;
    this._updateHUD();
    this.bag = new Bag();
    this.nextPiece = new Piece(this.bag.next());
    this._spawnPiece();
    this.state = 'playing';
    this._hideOverlay();
    this._lastDrop = performance.now();
    this._isOnGround = false;
    this._lockDelay = 0;
    cancelAnimationFrame(this._rafId);
    this._loop(performance.now());
  }

  restart() {
    cancelAnimationFrame(this._rafId);
    this.state = 'idle';
    this.start();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      cancelAnimationFrame(this._rafId);
      this._showOverlay('PAUSED', '', 'RESUME');
      this.elOverlayBtn.onclick = () => this._resume();
      this._render();
    } else if (this.state === 'paused') {
      this._resume();
    }
  }

  _resume() {
    this.state = 'playing';
    this._hideOverlay();
    this.elOverlayBtn.onclick = () => this._handleOverlayBtn();
    this._lastDrop = performance.now();
    this._loop(performance.now());
  }

  _gameOver() {
    this.state = 'gameover';
    cancelAnimationFrame(this._rafId);
    this._showOverlay('GAME OVER', `SCORE: ${this.score}`, 'RETRY');
    this.elOverlayBtn.onclick = () => this._handleOverlayBtn();
  }

  // ---- Piece management ----
  _spawnPiece() {
    this.piece = this.nextPiece;
    this.nextPiece = new Piece(this.bag.next());
    this.renderer.drawNext(this.nextPiece);
    // Check game over
    if (!this.board.isValid(this.piece.shape, this.piece.row, this.piece.col)) {
      this._gameOver();
      return false;
    }
    this._isOnGround = false;
    return true;
  }

  // ---- Actions ----
  _move(dir) {
    if (!this.piece) return;
    if (this.board.isValid(this.piece.shape, this.piece.row, this.piece.col + dir)) {
      this.piece.col += dir;
      this._isOnGround = false;
      this._render();
    }
  }

  _rotate(dir) {
    if (!this.piece) return;
    const p = this.piece;
    const prevRot = p.rotation;
    p.rotate(dir);

    // SRS wall kick attempts
    const kicks = this._getKicks(p.key, prevRot, p.rotation);
    let ok = false;
    for (const [kr, kc] of kicks) {
      if (this.board.isValid(p.shape, p.row + kr, p.col + kc)) {
        p.row += kr; p.col += kc;
        ok = true;
        break;
      }
    }
    if (!ok) {
      // Revert
      p.rotation = prevRot;
      p.shape = p.def.shapes[prevRot];
    } else {
      this._isOnGround = false;
      this._render();
    }
  }

  _getKicks(key, from, to) {
    // Standard SRS kick data (simplified)
    if (key === 'I') {
      const kicks_I = {
        '0_1': [[0,0],[0,-2],[0,1],[-1,-2],[2,1]],
        '1_0': [[0,0],[0,2],[0,-1],[1,2],[-2,-1]],
        '1_2': [[0,0],[0,-1],[0,2],[2,-1],[-1,2]],
        '2_1': [[0,0],[0,1],[0,-2],[-2,1],[1,-2]],
        '2_3': [[0,0],[0,2],[0,-1],[-1,2],[2,-1]],
        '3_2': [[0,0],[0,-2],[0,1],[1,-2],[-2,1]],
        '3_0': [[0,0],[0,1],[0,-2],[2,1],[-1,-2]],
        '0_3': [[0,0],[0,-1],[0,2],[-2,-1],[1,2]],
      };
      return kicks_I[`${from}_${to}`] || [[0,0]];
    }
    // Standard kicks for J, L, S, Z, T
    const kicks = {
      '0_1': [[0,0],[0,-1],[1,-1],[-2,0],[-2,-1]],
      '1_0': [[0,0],[0,1],[-1,1],[2,0],[2,1]],
      '1_2': [[0,0],[0,1],[-1,1],[2,0],[2,1]],
      '2_1': [[0,0],[0,-1],[1,-1],[-2,0],[-2,-1]],
      '2_3': [[0,0],[0,1],[1,1],[-2,0],[-2,1]],
      '3_2': [[0,0],[0,-1],[-1,-1],[2,0],[2,-1]],
      '3_0': [[0,0],[0,-1],[-1,-1],[2,0],[2,-1]],
      '0_3': [[0,0],[0,1],[1,1],[-2,0],[-2,1]],
    };
    return kicks[`${from}_${to}`] || [[0,0]];
  }

  _softDrop() {
    if (!this.piece) return;
    if (this.board.isValid(this.piece.shape, this.piece.row + 1, this.piece.col)) {
      this.piece.row++;
      this.score += 1;
      this._updateHUD();
      this._lastDrop = performance.now();
      this._render();
    }
  }

  _hardDrop() {
    if (!this.piece) return;
    let dropped = 0;
    while (this.board.isValid(this.piece.shape, this.piece.row + 1, this.piece.col)) {
      this.piece.row++;
      dropped++;
    }
    this.score += dropped * 2;
    this._updateHUD();
    this._lock();
  }

  _lock() {
    if (!this.piece) return;
    this.board.lock(this.piece);
    const cleared = this.board.clearLines();
    if (cleared > 0) {
      this.lines += cleared;
      this.score += LINE_SCORES[cleared] * this.level;
      this.level = Math.floor(this.lines / 10) + 1;
      this._updateHUD();
    }
    this.piece = null;
    if (this.state === 'playing') {
      this._spawnPiece();
    }
    this._render();
  }

  // ---- Game loop ----
  _loop(now) {
    if (this.state !== 'playing') return;
    this._rafId = requestAnimationFrame(t => this._loop(t));

    const interval = dropInterval(this.level);
    const elapsed = now - this._lastDrop;

    if (!this.piece) return;

    const onGround = !this.board.isValid(this.piece.shape, this.piece.row + 1, this.piece.col);

    if (onGround) {
      if (!this._isOnGround) {
        this._isOnGround = true;
        this._lockDelay = now;
      }
      if (now - this._lockDelay >= this._lockDelayMax) {
        this._lock();
        this._lastDrop = now;
        this._isOnGround = false;
      }
    } else {
      this._isOnGround = false;
      if (elapsed >= interval) {
        this.piece.row++;
        this._lastDrop = now;
        this._render();
      }
    }
  }

  // ---- HUD ----
  _updateHUD() {
    this.elScore.textContent = this.score.toLocaleString();
    this.elLevel.textContent = this.level;
    this.elLines.textContent = this.lines;
  }

  // ---- Render ----
  _render() {
    this.renderer.drawBoard(this.board, this.piece);
  }
}

// =====================================================
// Boot
// =====================================================
window.addEventListener('load', () => {
  new Game();
});
