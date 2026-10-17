import { expect, test, type Page } from '@playwright/test';

interface SimSnapshot {
  phase: string;
  time: number;
  score: number;
  lives: number | null;
  level: { number: number; style: string };
  balls: unknown[];
}

const sim = (page: Page): Promise<SimSnapshot | null> => page.evaluate(() => window.__BBI__?.sim() as SimSnapshot | null);

async function freshStart(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('mode-progression')).toBeVisible();
}

async function waitForPhase(page: Page, phase: string): Promise<void> {
  await expect.poll(async () => (await sim(page))?.phase, { timeout: 10_000 }).toBe(phase);
}

test.describe('Brick Breaker Infinite', () => {
  test('shows the main menu with both modes after skipping onboarding', async ({ page }) => {
    await freshStart(page);
    await expect(page.getByTestId('mode-highscore')).toBeVisible();
    await expect(page.getByTestId('nav-settings')).toBeVisible();
    await expect(page.getByTestId('continue-card')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__BBI__?.mode())).toBe('demo');
  });

  test('switches Classic/Maze and Retro/Neon and remembers the choice', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('style-maze').click();
    await expect(page.getByTestId('style-maze')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('theme-retro').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'retro');
    await page.evaluate(() => window.__BBI__?.flush());
    await page.reload();
    await expect(page.getByTestId('style-maze')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'retro');
    await page.getByTestId('theme-neon').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'neon');
  });

  test('starts Progression and plays a real level', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-progression').click();
    await expect(page.getByTestId('hud-level')).toHaveText('1');
    await waitForPhase(page, 'playing');
    const box = page.locator('#game');
    const b = await box.boundingBox();
    if (!b) throw new Error('no playfield');
    // Swipe anywhere: the paddle follows horizontally.
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.85, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => ((await page.evaluate(() => window.__BBI__?.sim())) as { paddle: { x: number } }).paddle.x).toBeGreaterThan(220);
  });

  test('starts High Score with five lives in Maze style', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('style-maze').click();
    await page.getByTestId('mode-highscore').click();
    await expect(page.getByTestId('hud-lives')).toHaveAttribute('data-count', '5');
    const s = await sim(page);
    expect(s?.level.style).toBe('maze');
    expect(s?.lives).toBe(5);
  });

  test('pause freezes the game and only Resume continues it', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-highscore').click();
    await waitForPhase(page, 'playing');
    await page.getByTestId('pause').click();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    const t1 = (await sim(page))?.time ?? 0;
    await page.waitForTimeout(700);
    expect((await sim(page))?.time).toBe(t1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    expect((await sim(page))?.time).toBe(t1);
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    await expect.poll(async () => (await sim(page))?.time ?? 0).toBeGreaterThan(t1);
  });

  test('completes a level and continues to the next one with the score carried over', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-progression').click();
    await waitForPhase(page, 'playing');
    await page.evaluate(() => window.__BBI__?.destroyAllBricks());
    await expect(page.getByTestId('level-complete')).toBeVisible();
    const score = await page.evaluate(() => (window.__BBI__?.data() as { session: { run: { score: number } } }).session.run.score);
    expect(score).toBeGreaterThan(0);
    await page.getByTestId('next-level').click();
    await expect(page.getByTestId('hud-level')).toHaveText('2');
    expect((await sim(page))?.score).toBe(score);
  });

  test('saves the unfinished game and resumes it after a restart', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-highscore').click();
    await waitForPhase(page, 'playing');
    await page.evaluate(() => window.__BBI__?.autopilot(true));
    await page.waitForTimeout(1500);
    // Backgrounding the app pauses and saves immediately.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    const before = await sim(page);
    await page.evaluate(() => window.__BBI__?.flush());
    await page.reload();
    await expect(page.getByTestId('continue-card')).toBeVisible();
    await page.getByTestId('continue').click();
    // A mid-level session resumes paused so the player is ready.
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    const after = await sim(page);
    expect(after?.time).toBeCloseTo(before?.time ?? -1, 5);
    expect(after?.score).toBe(before?.score);
    expect(after?.lives).toBe(before?.lives);
    expect(after?.balls).toEqual(before?.balls);
    await page.getByTestId('resume').click();
    await waitForPhase(page, after?.phase === 'serving' ? 'playing' : 'playing');
  });

  test('abandoning a session keeps records and statistics', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-progression').click();
    await waitForPhase(page, 'playing');
    await page.evaluate(() => window.__BBI__?.destroyAllBricks());
    await expect(page.getByTestId('level-complete')).toBeVisible();
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('continue-card')).toBeVisible();
    const statsBefore = await page.evaluate(() => (window.__BBI__?.data() as { profile: unknown }).profile);
    await page.getByTestId('abandon').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('continue-card')).toHaveCount(0);
    const after = await page.evaluate(() => window.__BBI__?.data() as { profile: unknown; session: unknown });
    expect(after.session).toBeNull();
    expect(after.profile).toEqual(statsBefore);
  });

  test('a failed Progression attempt returns to the checkpoint', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-progression').click();
    for (let level = 1; level <= 2; level++) {
      await waitForPhase(page, 'playing');
      await page.evaluate(() => window.__BBI__?.destroyAllBricks());
      await page.getByTestId('next-level').click();
    }
    await expect(page.getByTestId('hud-level')).toHaveText('3');
    await waitForPhase(page, 'playing');
    await page.evaluate(() => window.__BBI__?.loseAllBalls());
    await expect(page.getByTestId('attempt-failed')).toBeVisible();
    await page.getByTestId('retry').click();
    await expect(page.getByTestId('hud-level')).toHaveText('1');
  });

  test('High Score ends only after all five lives, then offers another run', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('mode-highscore').click();
    for (let lives = 5; lives >= 1; lives--) {
      await waitForPhase(page, 'playing');
      await page.evaluate(() => window.__BBI__?.loseAllBalls());
      if (lives > 1) await expect(page.getByTestId('hud-lives')).toHaveAttribute('data-count', String(lives - 1));
    }
    await expect(page.getByTestId('game-over')).toBeVisible();
    await expect(page.getByTestId('final-score')).toBeVisible();
    await page.getByTestId('play-again').click();
    await expect(page.getByTestId('hud-lives')).toHaveAttribute('data-count', '5');
  });

  test('changes language without resetting the game', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('nav-language').click();
    await page.getByTestId('lang-es').click();
    await expect(page.getByTestId('mode-progression')).toContainText('Progresión');
    await page.getByTestId('mode-progression').click();
    await waitForPhase(page, 'playing');
    await page.getByTestId('pause').click();
    const before = await sim(page);
    await page.getByTestId('pause-settings').click();
    await page.getByTestId('lang-pt-BR').click();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('resume')).toContainText('Continuar');
    const after = await sim(page);
    expect(after?.time).toBe(before?.time);
    expect(after?.level.number).toBe(before?.level.number);
  });

  test('opens statistics, achievements, collection and settings', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('nav-stats').click();
    await expect(page.getByTestId('stats')).toBeVisible();
    await page.getByTestId('back').click();
    await page.getByTestId('nav-achievements').click();
    await expect(page.getByTestId('ach-prog_5')).toBeVisible();
    await page.getByTestId('back').click();
    await page.getByTestId('nav-collection').click();
    await expect(page.getByTestId('cosmetic-ball.classic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cosmetic-ball.ring')).toBeDisabled();
    await page.getByTestId('back').click();
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('toggle-visibility').check();
    await expect(page.getByTestId('toggle-visibility')).toBeChecked();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('mode-progression')).toBeVisible();
  });

  test('runs the interactive tutorial and can skip it', async ({ page }) => {
    await page.goto('/?test=1');
    await page.getByTestId('tutorial-play').click();
    await expect.poll(() => page.evaluate(() => window.__BBI__?.mode())).toBe('tutorial');
    await expect(page.getByTestId('hud-message')).toBeVisible();
    await page.getByTestId('tutorial-skip-ingame').click();
    await expect(page.getByTestId('mode-progression')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
  });
});
