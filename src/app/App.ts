import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import type { SfxName } from '../audio/sfx';
import { cosmeticById } from '../core/meta/cosmetics';
import type { CollectibleKind, GameMode } from '../core/types';
import { abandonSession, describeSnapshot, GameSession } from '../game/session';
import { detectLanguage, deviceLanguages, setLanguage as applyLanguage, t } from '../i18n/i18n';
import { SaveManager } from '../persistence/saveManager';
import type { LanguageCode, SaveData, Settings } from '../persistence/schema';
import { setHapticsEnabled } from '../platform/haptics';
import { initLifecycle } from '../platform/lifecycle';
import { createStore } from '../platform/storageFactory';
import { GameScene } from '../render/GameScene';
import { powerIconDataUrl } from '../render/painter';
import { cosmeticPreview } from '../render/previews';
import { THEMES } from '../render/themes';
import { applyLayoutVars, computeLayout, readSafeInsets, renderDpr, type Layout } from '../ui/layout';
import { AchievementsScreen } from '../ui/screens/AchievementsScreen';
import { CollectionScreen } from '../ui/screens/CollectionScreen';
import { ConfirmDialog, LanguageSheet, OnboardingDialog, ProgressionStartSheet } from '../ui/screens/dialogs';
import { MainMenuScreen } from '../ui/screens/MainMenu';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import { StatsScreen } from '../ui/screens/StatsScreen';
import { UIManager, type View } from '../ui/UIManager';
import { GameController, type ControllerHost } from './GameController';
import { hideSplash } from './splash';
import { installTestHooks } from './testHooks';

/** Application shell: boot, persistence, navigation, settings and wiring of all subsystems. */
export class App implements ControllerHost {
  data!: SaveData;
  readonly audio = new AudioEngine();
  readonly ui: UIManager;
  readonly version = __APP_VERSION__;
  private readonly saves: SaveManager;
  private game: Phaser.Game | null = null;
  private scene!: GameScene;
  controller!: GameController;
  private currentLayout: Layout;
  private readonly cache = new Map<string, string>();
  private musicStarted = false;

  constructor(
    private readonly gameRoot: HTMLElement,
    uiRoot: HTMLElement,
  ) {
    this.ui = new UIManager(uiRoot);
    this.saves = new SaveManager(createStore());
    this.currentLayout = computeLayout(window.innerWidth, window.innerHeight, { top: 0, right: 0, bottom: 0, left: 0 });
  }

  async start(): Promise<void> {
    const loaded = await this.saves.load(detectLanguage(deviceLanguages()));
    this.data = loaded.data;
    applyLanguage(this.data.settings.language);
    this.applyTheme();
    this.applyAudioSettings();
    setHapticsEnabled(this.data.settings.haptics);
    this.relayout();
    await this.waitForFonts();
    await this.createGame();

    this.controller = new GameController(this, this.scene, this.gameRoot);
    this.controller.onLayout(this.currentLayout);
    this.scene.setVisuals(this.controller.visualOptions());
    this.controller.startDemo(this.data.settings.style);
    this.showMainMenu();

    window.addEventListener('resize', () => this.relayout());
    window.visualViewport?.addEventListener('resize', () => this.relayout());
    initLifecycle({
      onBackground: () => {
        this.controller.onBackground();
        this.audio.setAppActive(false);
        void this.saves.flush();
      },
      onForeground: () => {
        this.audio.setAppActive(true);
        this.relayout();
      },
      onBack: () => this.handleBack(),
      beforeExit: () => {
        this.controller.saveNow();
        return this.saves.flush();
      },
    });
    const unlock = (): void => {
      this.audio.unlock();
      if (!this.musicStarted) {
        this.musicStarted = true;
        this.audio.startMusic(this.controller.mode === 'demo' ? 'menu' : 'game');
      }
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    if (loaded.outcome === 'restoredBackup') this.ui.toast(t('toast.saveRecovered'), undefined, 'warn');
    if (loaded.outcome === 'reset') this.ui.toast(t('toast.saveReset'), undefined, 'warn');
    if (loaded.sessionDropped) this.ui.toast(t('toast.sessionDropped'), undefined, 'warn');
    if (!this.data.profile.onboarded) this.ui.openModal(new OnboardingDialog(this));
    this.persist();
    installTestHooks(this);
    void hideSplash();
  }

  // ------------------------------------------------------------------ boot helpers

  private async waitForFonts(): Promise<void> {
    try {
      await Promise.race([
        Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('700 16px Orbitron')]),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Fonts are cosmetic; system fallbacks are fine.
    }
  }

  private createGame(): Promise<void> {
    return new Promise((resolve) => {
      const dpr = renderDpr();
      this.scene = new GameScene();
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.gameRoot,
        width: Math.round(window.innerWidth * dpr),
        height: Math.round(window.innerHeight * dpr),
        transparent: true,
        banner: false,
        audio: { noAudio: true },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
        render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
        scene: [this.scene],
      });
      this.scene.whenReady(() => {
        this.scene.setTheme(THEMES[this.data.settings.theme]);
        this.fitCanvas();
        resolve();
      });
    });
  }

  private fitCanvas(): void {
    if (!this.game) return;
    const dpr = renderDpr();
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.game.scale.resize(Math.round(w * dpr), Math.round(h * dpr));
    this.game.scale.setZoom(1 / dpr);
    const canvas = this.game.canvas;
    if (canvas) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }

  private relayout(): void {
    this.currentLayout = computeLayout(window.innerWidth, window.innerHeight, readSafeInsets());
    applyLayoutVars(this.currentLayout);
    this.fitCanvas();
    this.controller?.onLayout(this.currentLayout);
  }

  layout(): Layout {
    return this.currentLayout;
  }

  private applyTheme(): void {
    document.body.dataset.theme = this.data.settings.theme;
    try {
      // Lets index.html style the splash screen with the right theme on the next launch.
      window.localStorage.setItem('bbi.theme', this.data.settings.theme);
    } catch {
      // Optional hint only.
    }
    this.audio.setTheme(this.data.settings.theme);
    this.cache.clear();
  }

  private applyAudioSettings(): void {
    const s = this.data.settings;
    this.audio.configure({ musicVolume: s.musicVolume, sfxVolume: s.sfxVolume, musicEnabled: s.musicEnabled, sfxEnabled: s.sfxEnabled });
    if (s.musicEnabled && this.musicStarted) this.audio.startMusic(this.controller?.mode === 'demo' ? 'menu' : 'game');
  }

  persist(): void {
    void this.saves.save(this.data);
  }

  async flushSaves(): Promise<void> {
    await this.saves.flush();
  }

  private handleBack(): boolean {
    if (this.ui.topModal) return this.ui.back();
    if (this.controller.mode === 'game') {
      this.controller.pause(true);
      return true;
    }
    if (this.controller.mode === 'tutorial') {
      this.finishTutorial(true);
      return true;
    }
    return this.ui.back();
  }

  // ------------------------------------------------------------------ navigation

  showMainMenu(): void {
    this.ui.closeAllModals();
    this.ui.showPage(new MainMenuScreen(this));
  }

  openSettings(): void {
    if (this.controller.mode !== 'demo') {
      let view: View | null = null;
      view = new SettingsScreen(this, () => view && this.ui.closeModal(view), true);
      this.ui.openModal(view);
      return;
    }
    this.ui.showPage(new SettingsScreen(this, () => this.showMainMenu(), false));
  }

  openStats(): void {
    this.ui.showPage(new StatsScreen(this));
  }

  openAchievements(): void {
    this.ui.showPage(new AchievementsScreen(this));
  }

  openCollection(): void {
    this.ui.showPage(new CollectionScreen(this));
  }

  openLanguagePicker(): void {
    this.ui.openModal(new LanguageSheet(this));
  }

  // ------------------------------------------------------------------ game flow

  requestStart(mode: GameMode): void {
    const proceed = (): void => {
      if (mode === 'progression') {
        const highest = this.data.profile.progression[this.data.settings.style].highestCheckpoint;
        if (highest > 0) this.ui.openModal(new ProgressionStartSheet(this));
        else this.startProgression(0);
      } else {
        this.startHighScore();
      }
    };
    const existing = this.data.session;
    if (!existing) {
      proceed();
      return;
    }
    const d = describeSnapshot(existing);
    const modeName = t(d.mode === 'progression' ? 'mode.progression' : 'mode.highscore');
    this.ui.openModal(
      new ConfirmDialog(this, t('menu.replaceTitle'), t('menu.replaceBody', { mode: modeName }), () => {
        abandonSession(this.data);
        this.persist();
        proceed();
      }),
    );
  }

  private sessionOptions(): { theme: Settings['theme'] } {
    return { theme: this.data.settings.theme };
  }

  startProgression(milestone: number): void {
    const session = GameSession.newProgression(this.data, this.data.settings.style, milestone, this.sessionOptions());
    this.beginSession(session, false);
  }

  startHighScore(): void {
    const params = new URLSearchParams(window.location.search);
    const forced = Number(params.get('seed'));
    const seed = Number.isFinite(forced) && forced > 0 ? forced : randomSeed();
    const session = GameSession.newHighScore(this.data, this.data.settings.style, seed, this.sessionOptions());
    this.beginSession(session, false);
  }

  continueSession(): void {
    const snapshot = this.data.session;
    if (!snapshot) return;
    const session = GameSession.resume(this.data, snapshot, this.sessionOptions());
    this.beginSession(session, snapshot.sim !== null);
  }

  private beginSession(session: GameSession, startPaused: boolean): void {
    this.ui.closeAllModals();
    this.ui.showPage(null);
    this.controller.startSession(session, startPaused);
    this.persist();
  }

  abandonSession(): void {
    this.ui.openModal(
      new ConfirmDialog(
        this,
        t('menu.abandonTitle'),
        t('menu.abandonBody'),
        () => {
          abandonSession(this.data);
          this.persist();
          this.showMainMenu();
        },
        t('menu.abandon'),
      ),
    );
  }

  resumeGame(): void {
    this.controller.resume();
  }

  pauseGame(): void {
    this.controller.pause(true);
  }

  quitToMenu(): void {
    this.controller.saveNow();
    this.controller.stopToDemo(this.data.settings.style);
    this.showMainMenu();
    this.persist();
  }

  nextLevel(): void {
    this.controller.nextLevel();
  }

  playAgain(): void {
    this.startHighScore();
  }

  activatePower(slot: number): void {
    this.controller.activatePower(slot);
  }

  // ------------------------------------------------------------------ settings & profile

  updateSettings(patch: Partial<Settings>): void {
    const before = { ...this.data.settings };
    Object.assign(this.data.settings, patch);
    const s = this.data.settings;
    if (s.theme !== before.theme) {
      this.applyTheme();
      this.scene.setTheme(THEMES[s.theme]);
      if (this.controller.mode !== 'demo') this.controller.refreshSettings();
    }
    if (s.style !== before.style && this.controller.mode === 'demo') this.controller.startDemo(s.style);
    if (s.musicVolume !== before.musicVolume || s.sfxVolume !== before.sfxVolume || s.musicEnabled !== before.musicEnabled || s.sfxEnabled !== before.sfxEnabled) {
      this.applyAudioSettings();
    }
    setHapticsEnabled(s.haptics);
    this.controller.refreshSettings();
    if (this.ui.currentPage instanceof MainMenuScreen && (s.style !== before.style || s.theme !== before.theme)) this.ui.currentPage.render();
    this.persist();
  }

  setLanguage(lang: LanguageCode): void {
    this.data.settings.language = lang;
    applyLanguage(lang);
    this.ui.refreshAll();
    this.controller.refreshLanguage();
    this.persist();
  }

  equipCosmetic(id: string): void {
    const def = cosmeticById(id);
    const cos = this.data.profile.cosmetics;
    if (!def || !cos.unlocked.includes(id)) return;
    cos.selected[def.category] = id;
    this.controller.refreshSettings();
    this.persist();
  }

  startTutorial(): void {
    this.ui.closeAllModals();
    this.ui.showPage(null);
    this.controller.startTutorial();
  }

  finishTutorial(skipped: boolean): void {
    const p = this.data.profile;
    p.onboarded = true;
    // Completing or skipping both count: the tutorial is never forced again (replay from Settings).
    p.tutorialDone = true;
    if (skipped) this.audio.play('uiBack');
    this.persist();
    if (this.controller.mode === 'tutorial') {
      this.controller.stopToDemo(this.data.settings.style);
      this.showMainMenu();
    }
  }

  // ------------------------------------------------------------------ assets

  sound(name: SfxName): void {
    this.audio.unlock();
    this.audio.play(name);
  }

  powerIcon(kind: CollectibleKind): string {
    const key = `icon:${this.data.settings.theme}:${kind}`;
    let url = this.cache.get(key);
    if (!url) {
      url = powerIconDataUrl(THEMES[this.data.settings.theme], kind);
      this.cache.set(key, url);
    }
    return url;
  }

  cosmeticPreview(id: string): string {
    const key = `cos:${this.data.settings.theme}:${id}`;
    let url = this.cache.get(key);
    if (!url) {
      url = cosmeticPreview(THEMES[this.data.settings.theme], id);
      this.cache.set(key, url);
    }
    return url;
  }
}

function randomSeed(): number {
  try {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] ?? 1) || 1;
  } catch {
    return Math.floor(Math.random() * 0xffffffff) || 1;
  }
}
