import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { startGame, submitScore } from "../lib/api.js";

const GRID = 8;
const TYPES = 6;
const TILE = 56;
const SCORE_PER_TILE = 10;
const DURATION = 120; // seconds

export default function Game({ onPlayingChange }) {
  const containerRef = useRef(null);
  const phaserRef = useRef(null);
  const timerRef = useRef(null);
  const tokenRef = useRef(null);

  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);

  async function begin() {
    if (starting || playing) return;
    setStarting(true);
    setScore(0);
    clearInterval(timerRef.current);

    try {
      const data = await startGame();
      const token = data?.token;
      if (!token) {
        alert(data?.error || "Start failed");
        setStarting(false);
        return;
      }

      tokenRef.current = token;
      setTimeLeft(DURATION);
      setPlaying(true);
      onPlayingChange?.(true);

      // টাইমার
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            endGame();
            return 0;
          }
          return t - 1;
        });
      }, 1000);

      // Phaser init (Browser-only)
      if (typeof window !== "undefined") {
        if (phaserRef.current && phaserRef.current.scene.keys.Match3Scene) {
          phaserRef.current.scene.keys.Match3Scene.resetBoard?.();
        } else {
          const config = {
            type: Phaser.AUTO,
            parent: containerRef.current,
            width: GRID * TILE,
            height: GRID * TILE,
            backgroundColor: "#0f172a",
            scene: [makeScene(setScore)],
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          };
          phaserRef.current = new Phaser.Game(config);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Game start error");
    } finally {
      setStarting(false);
    }
  }

  async function endGame() {
    if (!playing) return;
    setPlaying(false);
    onPlayingChange?.(false);
    clearInterval(timerRef.current);

    try {
      const token = tokenRef.current;
      tokenRef.current = null;
      if (!token) return;

      await submitScore(token, score);
    } catch (e) {
      console.error(e);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (phaserRef.current) {
        phaserRef.current.destroy(true);
        phaserRef.current = null;
      }
    };
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm">
          Time Left: <span className="font-bold">{timeLeft}s</span>
        </div>
        <div className="text-sm">
          Score: <span className="font-bold">{score}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="rounded-2xl overflow-hidden border border-slate-700 w-[448px] h-[448px]"
      />

      <div className="mt-3 flex gap-2">
        {!playing ? (
          <button className="btn" onClick={begin} disabled={starting}>
            {starting ? "Starting..." : "Start 2-min Round"}
          </button>
        ) : (
          <button className="btn" onClick={endGame}>
            End Round & Submit
          </button>
        )}
      </div>
    </div>
  );
}

function makeScene(setScore) {
  return class Match3Scene extends Phaser.Scene {
    constructor() {
      super("Match3Scene");
      this.board = [];
      this.sprites = [];
      this.selected = null;
      this.locked = false;
    }

    preload() {
      const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#06b6d4"];
      colors.forEach((c, i) => {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(Phaser.Display.Color.HexStringToColor(c).color, 1);
        g.fillRoundedRect(0, 0, TILE - 6, TILE - 6, 12);
        g.generateTexture(`candy${i}`, TILE - 6, TILE - 6);
        g.destroy();
      });
    }

    create() {
      this.input.on("pointerdown", this.onDown, this);
      this.input.on("pointerup", this.onUp, this);
      this.resetBoard();
    }

    resetBoard() {
      this.board = Array.from({ length: GRID }, () => Array(GRID).fill(0));
      this.sprites.forEach((s) => s.destroy());
      this.sprites = [];

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          let t;
          do {
            t = Math.floor(Math.random() * TYPES);
          } while (this.causesMatch(x, y, t));
          this.place(x, y, t);
        }
      }

      this.findAndClearMatches();
    }

    gridToXY(x, y) {
      return { px: x * TILE + TILE / 2, py: y * TILE + TILE / 2 };
    }

    causesMatch(x, y, t) {
      if (x >= 2 && this.board[y][x - 1] === t && this.board[y][x - 2] === t) return true;
      if (y >= 2 && this.board[y - 1][x] === t && this.board[y - 2][x] === t) return true;
      return false;
    }

    place(x, y, t) {
      this.board[y][x] = t;
      const { px, py } = this.gridToXY(x, y);
      const s = this.add
        .image(px, py, `candy${t}`)
        .setData({ x, y, t })
        .setInteractive({ useHandCursor: true });
      this.sprites.push(s);
    }

    spriteAt(x, y) {
      return this.sprites.find((s) => s.getData("x") === x && s.getData("y") === y);
    }

    onDown(pointer) {
      if (this.locked) return;
      const worldPoint = pointer.positionToCamera(this.cameras.main);
      const x = Math.floor(worldPoint.x / TILE);
      const y = Math.floor(worldPoint.y / TILE);
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
      this.selected = { x, y };
    }

    onUp(pointer) {
      if (this.locked || !this.selected) return;
      const worldPoint = pointer.positionToCamera(this.cameras.main);
      const x = Math.floor(worldPoint.x / TILE);
      const y = Math.floor(worldPoint.y / TILE);
      const { x: sx, y: sy } = this.selected;
      this.selected = null;
      if (x === sx && y === sy) return;
      if (Math.abs(x - sx) + Math.abs(y - sy) !== 1) return;
      this.trySwap(sx, sy, x, y);
    }

    trySwap(x1, y1, x2, y2) {
      if (!this.inBounds(x2, y2)) return;
      this.swapCells(x1, y1, x2, y2);
      const matched = this.hasMatches();
      if (matched) this.animateSwap(x1, y1, x2, y2, true);
      else {
        this.swapCells(x1, y1, x2, y2);
        this.animateSwap(x1, y1, x2, y2, false);
      }
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < GRID && y < GRID;
    }

    swapCells(x1, y1, x2, y2) {
      const t = this.board[y1][x1];
      this.board[y1][x1] = this.board[y2][x2];
      this.board[y2][x2] = t;

      const s1 = this.spriteAt(x1, y1);
      const s2 = this.spriteAt(x2, y2);
      if (s1) s1.setData({ x: x2, y: y2 });
      if (s2) s2.setData({ x: x1, y: y1 });
    }

    animateSwap(x1, y1, x2, y2, good) {
      this.locked = true;
      const s1 = this.spriteAt(x2, y2);
      const s2 = this.spriteAt(x1, y1);
      const p1 = this.gridToXY(x1, y1);
      const p2 = this.gridToXY(x2, y2);

      this.tweens.add({ targets: s1, x: p2.px, y: p2.py, duration: 120 });
      this.tweens.add({
        targets: s2,
        x: p1.px,
        y: p1.py,
        duration: 120,
        onComplete: () => {
          if (good) this.findAndClearMatches();
          this.locked = false;
        },
      });
    }

    hasMatches() {
      const c = this.collectMatches();
      return c.h.length > 0 || c.v.length > 0;
    }

    collectMatches() {
      const matched = [];
      for (let y = 0; y < GRID; y++) {
        let run = 1;
        for (let x = 1; x < GRID; x++) {
          if (this.board[y][x] === this.board[y][x - 1]) run++;
          else {
            if (run >= 3) matched.push({ y, x0: x - run, x1: x - 1 });
            run = 1;
          }
        }
        if (run >= 3) matched.push({ y, x0: GRID - run, x1: GRID - 1 });
      }

      const vmatched = [];
      for (let x = 0; x < GRID; x++) {
        let run = 1;
        for (let y = 1; y < GRID; y++) {
          if (this.board[y][x] === this.board[y - 1][x]) run++;
          else {
            if (run >= 3) vmatched.push({ x, y0: y - run, y1: y - 1 });
            run = 1;
          }
        }
        if (run >= 3) vmatched.push({ x, y0: GRID - run, y1: GRID - 1 });
      }

      return { h: matched, v: vmatched };
    }

    findAndClearMatches() {
      const m = this.collectMatches();
      const toClear = new Set();

      m.h.forEach(({ y, x0, x1 }) => {
        for (let x = x0; x <= x1; x++) toClear.add(`${x},${y}`);
      });
      m.v.forEach(({ x, y0, y1 }) => {
        for (let y = y0; y <= y1; y++) toClear.add(`${x},${y}`);
      });

      if (toClear.size === 0) return;

      toClear.forEach((key) => {
        const [x, y] = key.split(",").map(Number);
        const s = this.spriteAt(x, y);
        if (s)
          this.tweens.add({
            targets: s,
            alpha: 0,
            duration: 100,
            onComplete: () => s.destroy(),
          });
        this.board[y][x] = -1;
      });

      setScore((prev) => prev + SCORE_PER_TILE * toClear.size);

      this.time.delayedCall(120, () => {
        for (let x = 0; x < GRID; x++) {
          let writeY = GRID - 1;
          for (let y = GRID - 1; y >= 0; y--) {
            if (this.board[y][x] !== -1) {
              if (y !== writeY) {
                this.board[writeY][x] = this.board[y][x];
                const s = this.spriteAt(x, y);
                if (s) {
                  s.setData("y", writeY);
                  const { px, py } = this.gridToXY(x, writeY);
                  this.tweens.add({ targets: s, x: px, y: py, duration: 120 });
                }
              }
              writeY--;
            }
          }
          for (let y = writeY; y >= 0; y--) {
            const t = Math.floor(Math.random() * TYPES);
            this.board[y][x] = t;
            const { px, py } = this.gridToXY(x, y);
            const s = this.add
              .image(px, -56, `candy${t}`)
              .setData({ x, y, t })
              .setInteractive({ useHandCursor: true });
            this.sprites.push(s);
            this.tweens.add({ targets: s, y: py, duration: 140 });
          }
        }

        this.time.delayedCall(140, () => this.findAndClearMatches());
      });
    }
  };
}
