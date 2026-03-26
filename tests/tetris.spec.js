// @ts-check
const { test, expect } = require('@playwright/test');

// =====================================================
// Helpers
// =====================================================
async function openGame(page) {
  await page.goto('/');
  await page.waitForSelector('#game-canvas', { timeout: 5000 });
}

async function startGame(page) {
  await openGame(page);
  await page.locator('[data-testid="start-button"]').click();
  // Wait until overlay is gone (game is running)
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
}

/** Hard-drop via Space key and return the new score as a number. */
async function hardDrop(page) {
  await page.locator('#game-canvas').focus();
  await page.keyboard.press('Space');
  const text = await page.locator('[data-testid="score"]').textContent();
  return parseInt(text.replace(/,/g, ''), 10);
}

/** Read game internal state exposed via window.__game */
async function gameState(page) {
  return page.evaluate(() => window.__game?.state ?? 'unknown');
}

// =====================================================
// 1. 初期表示確認
// =====================================================
test('初期表示: タイトルとSTARTボタンが表示される', async ({ page }) => {
  await openGame(page);

  await expect(page).toHaveTitle('Mobile Tetris');

  const overlayTitle = page.locator('#overlay-title');
  await expect(overlayTitle).toBeVisible();
  await expect(overlayTitle).toHaveText('TETRIS');

  const startBtn = page.locator('[data-testid="start-button"]');
  await expect(startBtn).toBeVisible();
  await expect(startBtn).toHaveText('START');
});

// =====================================================
// 2. ゲーム開始【強化: state='playing' + ゲームループ動作確認】
// =====================================================
test('ゲーム開始: STARTクリックでゲームループが起動する', async ({ page }) => {
  await openGame(page);

  // Before start: overlay visible, state = 'idle'
  await expect(page.locator('#overlay')).not.toHaveClass(/hidden/);
  expect(await gameState(page)).toBe('idle');

  // Click START
  await page.locator('[data-testid="start-button"]').click();

  // Overlay must disappear
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);

  // Internal state must be 'playing'
  expect(await gameState(page)).toBe('playing');

  // NEXT canvas should have been drawn (non-transparent pixels exist)
  const nextHasPixels = await page.evaluate(() => {
    const nc = document.getElementById('next-canvas');
    const ctx = nc.getContext('2d');
    const d = ctx.getImageData(0, 0, nc.width, nc.height).data;
    // Check if any pixel is not fully transparent
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 0) return true;
    }
    return false;
  });
  expect(nextHasPixels).toBe(true);
});

// =====================================================
// 3. Canvas 表示
// =====================================================
test('Canvas: game-canvas が表示されサイズを持つ', async ({ page }) => {
  await openGame(page);

  const canvas = page.locator('[data-testid="game-canvas"]');
  await expect(canvas).toBeVisible();

  const size = await canvas.evaluate(el => ({ w: el.width, h: el.height }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);
  // Aspect ratio ≈ 1:2 (10 cols × 20 rows)
  expect(size.h / size.w).toBeCloseTo(2, 0);
});

// =====================================================
// 4. スコアが増える【強化: Hard Drop で実際にスコアを増やす】
// =====================================================
test('スコア増加: ハードドロップ後にスコアが0より大きくなる', async ({ page }) => {
  await startGame(page);

  // Confirm score starts at 0
  await expect(page.locator('[data-testid="score"]')).toHaveText('0');

  // Hard drop via Space (score += dropped_rows * 2, minimum ~20 pts on empty board)
  const scoreAfter = await hardDrop(page);
  expect(scoreAfter).toBeGreaterThan(0);

  // Hard drop again → score keeps increasing
  const scoreAfter2 = await hardDrop(page);
  expect(scoreAfter2).toBeGreaterThan(scoreAfter);
});

// =====================================================
// 5. モバイル操作ボタン
// =====================================================
test('モバイル操作ボタン: 左右・回転・落下・ドロップボタンが存在する', async ({ page }) => {
  await openGame(page);

  const buttons = [
    { id: '#btn-left',   label: 'Left'      },
    { id: '#btn-right',  label: 'Right'     },
    { id: '#btn-rotate', label: 'Rotate'    },
    { id: '#btn-soft',   label: 'Soft Drop' },
    { id: '#btn-hard',   label: 'Hard Drop' },
  ];

  for (const { id, label } of buttons) {
    await expect(page.locator(id), `Button "${label}" should be visible`).toBeVisible();
  }
});

// =====================================================
// 6. 一時停止【強化: pause中にキー操作してもスコアが変化しない】
// =====================================================
test('一時停止: pause中はキー操作を受け付けずスコアが変化しない', async ({ page }) => {
  await startGame(page);

  // Drop once to get a non-zero score for reference
  const scoreBefore = await hardDrop(page);
  expect(scoreBefore).toBeGreaterThan(0);

  // Pause the game
  await page.locator('[data-testid="pause-button"]').click();

  // Overlay shows PAUSED
  await expect(page.locator('#overlay')).not.toHaveClass(/hidden/);
  await expect(page.locator('#overlay-title')).toHaveText('PAUSED');

  // Internal state must be 'paused'
  expect(await gameState(page)).toBe('paused');

  // Attempt Space (hard drop) while paused — score must NOT change
  await page.keyboard.press('Space');
  const scoreDuringPause = parseInt(
    (await page.locator('[data-testid="score"]').textContent()).replace(/,/g, ''),
    10
  );
  expect(scoreDuringPause).toBe(scoreBefore);

  // Resume and verify state returns to 'playing'
  await page.locator('[data-testid="pause-button"]').click();
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  expect(await gameState(page)).toBe('playing');
});

// =====================================================
// 7. リスタート【強化: score>0 の状態からリセットして全フィールドを確認】
// =====================================================
test('リスタート: score/level/lines が全てリセットされる', async ({ page }) => {
  await startGame(page);

  // Build up a non-zero score
  const scoreBefore = await hardDrop(page);
  expect(scoreBefore).toBeGreaterThan(0);

  // Restart
  await page.locator('[data-testid="restart-button"]').click();

  // Overlay must stay hidden (game restarts immediately)
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);

  // All counters must be back to initial values
  await expect(page.locator('[data-testid="score"]')).toHaveText('0');
  await expect(page.locator('[data-testid="level"]')).toHaveText('1');
  await expect(page.locator('[data-testid="lines"]')).toHaveText('0');

  // Game must be running again
  expect(await gameState(page)).toBe('playing');
});

// =====================================================
// 8. モバイル表示確認（Pixel / iPhone 向け）
// =====================================================
test('モバイル表示: コントロールパネルとcanvasが同時に表示される', async ({ page }) => {
  await openGame(page);

  const controls = page.locator('[data-testid="controls"]');
  const canvas   = page.locator('[data-testid="game-canvas"]');
  const header   = page.locator('#header');

  await expect(controls).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(header).toBeVisible();

  const controlsBox = await controls.boundingBox();
  const canvasBox   = await canvas.boundingBox();

  expect(controlsBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();

  // Controls should appear at or below the canvas vertically
  expect(controlsBox.y).toBeGreaterThanOrEqual(canvasBox.y);
});
