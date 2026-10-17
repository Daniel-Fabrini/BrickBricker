import type { AppApi } from '../../app/api';
import { ACHIEVEMENTS } from '../../core/meta/achievements';
import { formatDuration, formatNumber, t } from '../../i18n/i18n';
import { screenHeader, section, statRow } from '../components';
import { h } from '../dom';
import { View } from '../UIManager';

export class StatsScreen extends View {
  constructor(private readonly app: AppApi) {
    super('screen stats-screen');
  }

  render(): void {
    const p = this.app.data.profile;
    const s = p.stats;
    const n = formatNumber;
    const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id] !== undefined).length;
    this.el.replaceChildren(
      screenHeader(this.app, 'stats.title', () => this.app.showMainMenu()),
      h(
        'div',
        { class: 'screen-body', attrs: { 'data-testid': 'stats' } },
        section(
          'stats.progression',
          statRow(t('stats.bestLevelClassic'), n(p.progression.classic.bestLevel)),
          statRow(t('stats.bestLevelMaze'), n(p.progression.maze.bestLevel)),
          statRow(t('stats.checkpointClassic'), n(p.progression.classic.highestCheckpoint)),
          statRow(t('stats.checkpointMaze'), n(p.progression.maze.highestCheckpoint)),
          statRow(t('stats.progressionSessions'), n(s.progressionSessions)),
          statRow(t('stats.checkpoints'), n(s.checkpointsReached)),
          statRow(t('stats.attemptsFailed'), n(s.attemptsFailed)),
        ),
        section(
          'stats.highscore',
          statRow(t('stats.bestScoreClassic'), n(p.highScores.classic.score)),
          statRow(t('stats.bestScoreMaze'), n(p.highScores.maze.score)),
          statRow(t('stats.highScoreRuns'), n(s.highScoreRuns)),
          statRow(t('stats.livesLost'), n(s.livesLost)),
          statRow(t('stats.extraLives'), n(s.extraLivesCollected)),
        ),
        section(
          'stats.general',
          statRow(t('stats.gamesPlayed'), n(s.gamesPlayed)),
          statRow(t('stats.levelsCompleted'), n(s.levelsCompleted)),
          statRow(t('stats.mazeLevels'), n(s.mazeLevelsCompleted)),
          statRow(t('stats.specialLevels'), n(s.specialLevelsCompleted)),
          statRow(t('stats.bricks'), n(s.bricksDestroyed)),
          statRow(t('stats.balls'), n(s.ballsLaunched), t('stats.ballsNote')),
          statRow(t('stats.bestCombo'), n(s.bestCombo)),
          statRow(t('stats.totalScore'), n(s.totalScore)),
          statRow(t('stats.achievements'), `${unlocked} / ${ACHIEVEMENTS.length}`),
          statRow(t('stats.playTime'), formatDuration(s.playTimeSeconds)),
        ),
        section(
          'stats.powers',
          statRow(t('stats.powersCollected'), n(s.powersCollected)),
          statRow(t('stats.powersActivated'), n(s.powersActivated)),
          statRow(t('stats.bricksByPower'), n(s.bricksDestroyedByPower)),
          statRow(t('power.multiball'), `${n(s.collectedByType.multiball)} / ${n(s.activatedByType.multiball)}`),
          statRow(t('power.piercing'), `${n(s.collectedByType.piercing)} / ${n(s.activatedByType.piercing)}`),
          statRow(t('power.explosion'), `${n(s.collectedByType.explosion)} / ${n(s.activatedByType.explosion)}`),
        ),
      ),
    );
  }

  override onBack(): boolean {
    this.app.showMainMenu();
    return true;
  }
}
