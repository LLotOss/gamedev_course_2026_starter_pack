import Phaser from 'phaser';

const PLAYER_START_SPEED = 130;
const PLAYER_SPEED_PER_SCORE = 9;
const PLAYER_SIZE = 42;
const PLAYER_COLOR = 0x38bdf8;
const PLAYER_PHASE_COLOR = 0x7dd3fc;
const PHASE_MIN_MS = 1000;
const PHASE_MAX_MS = 3000;
const WALL_LENGTH = 100;
const WALL_THICKNESS = 6;
const WALL_SAFE_GAP = 56;
const WALL_SPAWN_ATTEMPTS = 40;
const PLAY_AREA_TOP = 110;
const PHASE_COOLDOWN = 1000;

/**
 * Минимальная рабочая сцена курса.
 *
 * Здесь намеренно почти нет "игры": квадрат двигается, круг можно собирать,
 * растёт счёт. Задача студента — превратить этот каркас в собственную игру.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private target!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private scoreText!: Phaser.GameObjects.Text;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private phaseKey!: Phaser.Input.Keyboard.Key;
  private titleText!: Phaser.GameObjects.Text;
  private walls: Phaser.GameObjects.Rectangle[] = [];
  private score = 0;
  private playerSpeed = PLAYER_START_SPEED;
  private moveX = 1;
  private moveY = 0;
  private alive = true;
  private phasing = false;
  private phaseElapsedMs = 0;
  private phaseCooldownATM = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.score = 0;
    this.playerSpeed = PLAYER_START_SPEED;
    this.moveX = 1;
    this.moveY = 0;
    this.alive = true;
    this.phasing = false;
    this.phaseElapsedMs = 0;
    this.walls = [];

    const { width, height } = this.scale;

    this.add
      .text(width / 2, 28, 'GAME DEV STARTER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    this.titleText = this.add
      .text(width / 2, 68, `Стрелки / WASD — руль. Space — phase. Край экрана убивает.`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#cbd5e1',
        },
      )
      .setOrigin(0.5, 0);

    this.player = this.add.rectangle(width / 2, height / 2, PLAYER_SIZE, PLAYER_SIZE, PLAYER_COLOR);
    this.target = this.add.circle(width * 0.72, height * 0.52, 18, 0xfacc15);

    this.scoreText = this.add.text(24, height - 48, 'Score: 0 Phase cooldown: 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
    });

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.phaseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.spawnWall();
  }

  update(_time: number, delta: number): void {
    if (!this.alive) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    this.updatePhase(delta);
    this.steerFromInput();

    const seconds = delta / 1000;
    this.player.x += this.moveX * this.playerSpeed * seconds;
    this.player.y += this.moveY * this.playerSpeed * seconds;

    this.checkScreenEdge();
    if (!this.alive) return;

    this.checkWalls();
    if (!this.alive) return;

    this.checkTarget();
  }

  private steerFromInput(): void {
    let dx = 0;
    let dy = 0;

    if ((this.cursors.left.isDown || this.wasd.left.isDown) && this.moveX !== 1)dx -= 1;
    else if ((this.cursors.right.isDown || this.wasd.right.isDown) && this.moveX !== -1) dx += 1;
    else if ((this.cursors.up.isDown || this.wasd.up.isDown) && this.moveY !== 1) dy -= 1;
    else if ((this.cursors.down.isDown || this.wasd.down.isDown) && this.moveY !== -1) dy += 1;

    if (dx === 0 && dy === 0) return;

    const backward = (dx - this.moveX) * (dy - this.moveY);
    if (backward !== 0) {
      dx -= this.moveX * backward;
      dy -= this.moveY * backward;
    }

    const length = Math.hypot(dx, dy);
    if (length === 0) return;

    this.moveX = dx / length;
    this.moveY = dy / length;
  }

  private updatePhase(delta: number): void {
    if (this.phaseCooldownATM <= 0) {
      if (!this.phasing && Phaser.Input.Keyboard.JustDown(this.phaseKey)) {
        this.phasing = true;
        this.phaseElapsedMs = 0;
        this.player.setFillStyle(PLAYER_PHASE_COLOR);
        this.player.setAlpha(0.55);
        this.phaseCooldownATM = PHASE_COOLDOWN;
      }
    }

    this.scoreText.setText(`Score: ${this.score} Phase cooldown: ${Math.floor(this.phaseCooldownATM)}`);

    if (!this.phasing && this.phaseCooldownATM > 0) {
      this.phaseCooldownATM -= delta;
      if (this.phaseCooldownATM <= 0) {
        this.phaseCooldownATM = 0;
      }
      return;
    };

    this.phaseElapsedMs += delta;

    const pastMinimum = this.phaseElapsedMs >= PHASE_MIN_MS;
    const pastMaximum = this.phaseElapsedMs >= PHASE_MAX_MS;
    if (pastMaximum || (pastMinimum && !this.isTouchingWall())) {
      this.endPhase();
    }
  }

  private endPhase(): void {
    this.phasing = false;
    this.phaseElapsedMs = 0;
    this.player.setFillStyle(PLAYER_COLOR);
    this.player.setAlpha(1);
  }

  private checkScreenEdge(): void {
    const half = this.player.width / 2;
    const hitEdge =
      this.player.x <= half ||
      this.player.x >= this.scale.width - half ||
      this.player.y <= PLAY_AREA_TOP + half ||
      this.player.y >= this.scale.height - half;

    if (hitEdge) this.killPlayer();
  }

  private checkWalls(): void {
    if (this.phasing) return;
    if (this.isTouchingWall()) this.killPlayer();
  }

  private isTouchingWall(): boolean {
    const playerBounds = this.player.getBounds();

    return this.walls.some((wall) =>
      Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, wall.getBounds()),
    );
  }

  private killPlayer(): void {
    if (!this.alive) return;

    this.alive = false;
    this.endPhase();
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, `Игра окончена! Счёт: ${this.score}\nНажмите R, чтобы начать заново!`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
  }

  private checkTarget(): void {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.target.x,
      this.target.y,
    );

    if (distance > 42) return;

    this.score += 1;
    this.playerSpeed += PLAYER_SPEED_PER_SCORE;
    this.scoreText.setText(`Score: ${this.score} Phase cooldown: ${Math.floor(this.phaseCooldownATM)}`);

    if (this.score % 2 === 0) {
      this.spawnWall();
    }

    this.placeTargetAwayFromPlayer();
  }

  private spawnWall(): void {
    for (let attempt = 0; attempt < WALL_SPAWN_ATTEMPTS; attempt += 1) {
      const vertical = Math.random() < 0.5;
      const width = vertical ? WALL_THICKNESS : WALL_LENGTH;
      const height = vertical ? WALL_LENGTH : WALL_THICKNESS;
      const x = Phaser.Math.Between(
        Math.ceil(width / 2 + 8),
        Math.floor(this.scale.width - width / 2 - 8),
      );
      const y = Phaser.Math.Between(
        Math.ceil(PLAY_AREA_TOP + height / 2 + 8),
        Math.floor(this.scale.height - height / 2 - 8),
      );

      if (this.overlapsPlayer(x, y, width, height, WALL_SAFE_GAP)) continue;

      const wall = this.add.rectangle(x, y, width, height, 0xf43f5e);
      this.walls.push(wall);
      return;
    }
  }

  private placeTargetAwayFromPlayer(): void {
    for (let attempt = 0; attempt < WALL_SPAWN_ATTEMPTS; attempt += 1) {
      const x = Phaser.Math.Between(60, this.scale.width - 60);
      const y = Phaser.Math.Between(140, this.scale.height - 80);
      if (this.overlapsPlayer(x, y, 36, 36, 24)) continue;
      this.target.setPosition(x, y);
      return;
    }
  }

  private overlapsPlayer(
    x: number,
    y: number,
    width: number,
    height: number,
    gap: number,
  ): boolean {
    return (
      Math.abs(x - this.player.x) < (width + this.player.width) / 2 + gap &&
      Math.abs(y - this.player.y) < (height + this.player.height) / 2 + gap
    );
  }
}
