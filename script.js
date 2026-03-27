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

// localStorage key for best score persistence
const BEST_KEY = 'tetris_best';

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

  // アニメーション用：消去対象の行インデックスを返す（盤面は変更しない）
  findFullRows() {
    const rows = [];
    for (let r = 0; r < ROWS + HIDDEN_ROWS; r++) {
      if (this.grid[r].every(cell => cell !== null)) rows.push(r);
    }
    return rows;
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
  constructor(gameCanvas, nextCanvas, holdCanvas) {
    this.gc = gameCanvas;
    this.nc = nextCanvas;
    this.hc = holdCanvas;
    this.ctx  = gameCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.hctx = holdCanvas.getContext('2d');
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

  drawBoard(board, piece, flashRows = []) {
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

    // ライン消去フラッシュ：満杯行を白く塗り潰して演出
    if (flashRows.length > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      for (const r of flashRows) {
        const visR = r - offset;
        if (visR < 0 || visR >= visibleRows) continue;
        ctx.fillRect(0, visR * cs, COLS * cs, cs);
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

  // HOLD キャンバスを描画。canHold=false のとき薄く表示してクールダウン中を伝える。
  drawHold(piece, canHold) {
    const ctx = this.hctx;
    const hc = this.hc;
    const cs = 20; // 80px ÷ 4セル = 20px（全ピースが収まるサイズ）
    ctx.clearRect(0, 0, hc.width, hc.height);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, hc.width, hc.height);
    if (!piece) return;

    if (!canHold) ctx.globalAlpha = 0.35; // ホールド使用済み：薄く表示

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
    const ox = Math.floor((hc.width  - pw) / 2) - minC * cs;
    const oy = Math.floor((hc.height - ph) / 2) - minR * cs;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (s[r * 4 + c]) {
          this._drawCell(ctx, ox + c * cs, oy + r * cs, cs, piece.color);
        }
      }
    }
    ctx.globalAlpha = 1; // 透明度リセット
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
    this.heldPiece = null; // ホールド中のピース（null = 空）
    this.canHold = true;   // false = ピース固定まで再ホールド不可
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.bestScore = 0;
    this.state = 'idle'; // idle | playing | paused | gameover
    this._dropTimer = null;
    this._lastDrop = 0;
    this._rafId = null;
    this._lockDelay = 0;
    this._lockDelayMax = 500;
    this._isOnGround = false;
    this._flashRows  = [];   // 現在フラッシュ中の行インデックス
    this._flashToken = 0;    // リスタート時に setTimeout をキャンセルするためのトークン

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
    this.holdCanvas = document.getElementById('hold-canvas');

    this.elBest = document.getElementById('best');
    // localStorage から保存済みハイスコアを読み込む（初回は 0）
    this.bestScore = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
    this.elBest.textContent = this.bestScore.toLocaleString();

    this.elOverlayBtn.addEventListener('click', () => this._handleOverlayBtn());
    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-restart').addEventListener('click', () => this.restart());
  }

  // ---- Renderer + sizing ----
  _initRenderer() {
    this.renderer = new Renderer(this.gameCanvas, this.nextCanvas, this.holdCanvas);
    this._resizeRafId = null;
    this._updateSize();
    const onResize = () => {
      if (this._resizeRafId) cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = requestAnimationFrame(() => this._updateSize());
    };
    window.addEventListener('resize', onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }
  }

  _updateSize() {
    const wrapper = document.getElementById('canvas-wrapper');
    const main = document.getElementById('main');
    const sidePanel = document.getElementById('side-panel');
    const controls = document.getElementById('mobile-controls');
    const header = document.getElementById('header');

    // visualViewport はモバイルのキーボード表示等でも正確な高さを返す
    const viewH = (window.visualViewport ? window.visualViewport.height : null)
                  || document.documentElement.clientHeight;
    const headerH = header.offsetHeight;
    const controlsH = controls.offsetHeight;
    const availH = viewH - headerH - controlsH - 32; // 32 = padding + gap バッファ

    const mainW = main.offsetWidth;
    const sidePanelW = sidePanel.offsetWidth;
    const availW = mainW - sidePanelW - 32;

    const cellByH = Math.floor(availH / ROWS);
    const cellByW = Math.floor(availW / COLS);
    const cs = Math.max(14, Math.min(cellByH, cellByW));

    this.renderer.resize(cs);
    wrapper.style.width = (COLS * cs) + 'px';
    wrapper.style.height = (ROWS * cs) + 'px';

    this._render();
  }

  // ---- Input ----
  _initInput() {
    // Keyboard
    document.addEventListener('keydown', e => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','KeyP','KeyR','KeyC'].includes(e.code)) {
        e.preventDefault();
      }
      if (this.state === 'playing') {
        switch (e.code) {
          case 'ArrowLeft':  this._move(-1); break;
          case 'ArrowRight': this._move(1); break;
          case 'ArrowDown':  this._softDrop(); break;
          case 'ArrowUp':    this._rotate(1); break;
          case 'Space':      this._hardDrop(); break;
          case 'KeyC':       this._hold(); break;
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

    // Mobile buttons（delays: start=長押し開始ms, repeat=連打間隔ms）
    this._bindBtn('btn-left',   () => this._move(-1),   false, { repeat: 60 });  // キビキビした横移動
    this._bindBtn('btn-right',  () => this._move(1),    false, { repeat: 60 });
    this._bindBtn('btn-soft',   () => this._softDrop(), false, { start: 100, repeat: 50 }); // ソフトドロップは素早く反応
    this._bindBtn('btn-hold',   () => this._hold(),     true);
    this._bindBtn('btn-rotate', () => this._rotate(1), true);
    this._bindBtn('btn-hard',   () => this._hardDrop(), true);

    // Swipe on game canvas
    this._initSwipe();
  }

  _bindBtn(id, action, noRepeat = false, delays = {}) {
    const btn = document.getElementById(id);
    if (!btn) return;

    let repeatTimer = null;
    let repeatDelay = null;
    const START_DELAY = delays.start ?? 180;
    const REPEAT_DELAY = delays.repeat ?? 80;

    const start = (e) => {
      e.preventDefault();
      if (this.state !== 'playing') return;
      btn.classList.add('pressed');
      action();
      if (!noRepeat) {
        clearTimeout(repeatDelay);
        clearInterval(repeatTimer);
        repeatDelay = setTimeout(() => {
          repeatTimer = setInterval(() => {
            if (this.state === 'playing') action();
            else stop();
          }, REPEAT_DELAY);
        }, START_DELAY);
      }
    };
    const stop = () => {
      btn.classList.remove('pressed');
      clearTimeout(repeatDelay);
      clearInterval(repeatTimer);
      repeatTimer = null;
      repeatDelay = null;
    };

    // Pointer Events でタッチ・マウス両対応（より信頼性が高い）
    btn.addEventListener('pointerdown', start, { passive: false });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
  }

  _initSwipe() {
    // Swipe removed: all operations handled via on-screen buttons
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
    this._flashToken++;   // 前のゲームで保留中の setTimeout があればキャンセル
    this._flashRows = [];
    this.heldPiece = null;
    this.canHold   = true;
    this.board.reset();
    this.score = 0; this.level = 1; this.lines = 0;
    this._updateHUD();
    this.elBest.classList.remove('new-best'); // 前回のグロー演出をリセット
    document.getElementById('btn-hold')?.classList.remove('hold-used');
    this.bag = new Bag();
    this.nextPiece = new Piece(this.bag.next());
    this.renderer.drawHold(null, true); // ホールド枠を空で初期化
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
    // ラインなし終了でも _updateHUD が呼ばれないケースをカバー
    const isNewBest = this._checkBest();
    const scoreText = isNewBest
      ? `\uD83C\uDFC6 NEW BEST: ${this.score.toLocaleString()}`
      : `SCORE: ${this.score.toLocaleString()}`;
    this._showOverlay('GAME OVER', scoreText, 'RETRY');
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

  _hold() {
    // フラッシュ中は piece === null なのでここに到達しない（自然にガードされる）
    if (!this.piece || !this.canHold) return;

    this.canHold = false;
    document.getElementById('btn-hold')?.classList.add('hold-used');

    if (this.heldPiece === null) {
      // ホールドが空 → 現在ピースを保存して次ピースをスポーン
      this.heldPiece = new Piece(this.piece.key); // rotation=0 のリセット状態で保存
      this.piece = null;
      this._spawnPiece();
      this._lastDrop = performance.now(); // 即落下防止
    } else {
      // ホールドにピースあり → 現在ピースとホールドを交換
      const incomingKey = this.heldPiece.key;
      this.heldPiece = new Piece(this.piece.key); // 現在ピースをホールドへ
      this.piece     = new Piece(incomingKey);    // ホールドのピースを初期位置で展開

      if (!this.board.isValid(this.piece.shape, this.piece.row, this.piece.col)) {
        this._gameOver(); // スポーン位置が埋まっていればゲームオーバー
        return;
      }
      this._isOnGround = false;
      this._lastDrop = performance.now(); // 即落下防止
    }

    this.renderer.drawHold(this.heldPiece, this.canHold);
    this._render();
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
    this.piece = null; // ピースを消費（ループ・入力操作は自然にブロックされる）

    const fullRows = this.board.findFullRows();
    if (fullRows.length > 0) {
      // フェーズ1: 満杯行をフラッシュ表示（160ms）
      const token = ++this._flashToken;
      this._flashRows = fullRows;
      this._render(); // フラッシュ開始フレームを即描画
      setTimeout(() => {
        if (this._flashToken !== token) return; // リスタートでキャンセル済み
        this._finalizeClear(fullRows.length);   // フェーズ2: 実際に消去・スポーン
      }, 160);
    } else {
      this._finalizeClear(0); // 消去なし → 即スポーン
    }
  }

  // ライン消去の確定処理（フラッシュ後、またはフラッシュなし時に呼ばれる）
  _finalizeClear(count) {
    this._flashRows = [];
    if (count > 0) {
      this.board.clearLines();
      this.lines += count;
      this.score += LINE_SCORES[count] * this.level;
      this.level = Math.floor(this.lines / 10) + 1;
      this._updateHUD();
    }
    // playing/paused どちらでも次のピースをスポーン（paused中はループが止まるだけ）
    if (this.state === 'playing' || this.state === 'paused') {
      // ピース固定 → ホールドを再び使えるようにする
      this.canHold = true;
      document.getElementById('btn-hold')?.classList.remove('hold-used');
      this.renderer.drawHold(this.heldPiece, this.canHold);
      this._spawnPiece();
      this._lastDrop = performance.now(); // フラッシュ時間分の経過をリセット → 即落下防止
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

  // ---- Best Score ----
  // 現在スコアがベストを超えていれば保存・表示更新・グロー演出を発動。
  // true を返すと呼び出し元が「新記録」と判定できる。
  _checkBest() {
    if (this.score <= this.bestScore) return false;
    this.bestScore = this.score;
    localStorage.setItem(BEST_KEY, this.bestScore);
    this.elBest.textContent = this.bestScore.toLocaleString();
    // CSS animation をリセットして再発動（reflow で強制再起動）
    this.elBest.classList.remove('new-best');
    void this.elBest.offsetWidth;
    this.elBest.classList.add('new-best');
    return true;
  }

  // ---- HUD ----
  _updateHUD() {
    this.elScore.textContent = this.score.toLocaleString();
    this.elLevel.textContent = this.level;
    this.elLines.textContent = this.lines;
    this._checkBest();
  }

  // ---- Render ----
  _render() {
    this.renderer.drawBoard(this.board, this.piece, this._flashRows);
  }
}

// =====================================================
// Boot
// =====================================================
window.addEventListener('load', () => {
  window.__game = new Game(); // exposed for E2E tests only
});
