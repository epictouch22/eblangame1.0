import React, { useCallback, useEffect, useRef, useState } from 'react';
import './basketball.css';

const WIDTH = 360;
const HEIGHT = 500;
const BALL_X = 118;
const BALL_RADIUS = 12;
const RIM_RADIUS_X = 43;
const RIM_RADIUS_Y = 13;
const SCORING_HALF_WIDTH = 33;
const HOOP_GAP = 292;
const SCROLL_SPEED = 133;
const GRAVITY = 900;
const FLAP_SPEED = -335;
const BASE_COINS = 15;
const BEST_KEY = 'eblangame.solo.basketball.best.v1';

type Hoop = {
  id: number;
  x: number;
  y: number;
  blue: boolean;
  scored: boolean;
  touched: boolean;
};
type Game = {
  y: number;
  velocity: number;
  hoops: Hoop[];
  score: number;
  baskets: number;
  streak: number;
  earned: number;
  nextId: number;
  running: boolean;
  over: boolean;
  failedBy: string;
  elapsed: number;
  lastText: string;
};

const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number));
const initialHoop = (): Hoop => ({
  id: 0, x: 355, y: 254, blue: false, scored: false, touched: false,
});

function randomHoop(previous: Hoop, id: number): Hoop {
  // Small changes in height make consecutive hoops reachable by repeated flaps.
  const y = clamp(previous.y + (Math.random() - .5) * 145, 155, 358);
  return { id, x: previous.x + HOOP_GAP, y, blue: Math.random() < .31, scored: false, touched: false };
}
function newGame(): Game {
  const first = initialHoop();
  return {
    y: 220, velocity: 0,
    hoops: [first, randomHoop(first, 1)],
    score: 0, baskets: 0, streak: 0, earned: 0,
    nextId: 2, running: false, over: false, failedBy: '',
    elapsed: 0, lastText: '',
  };
}
function savedBest() {
  try {
    const best = Number(localStorage.getItem(BEST_KEY) || '0');
    return Number.isSafeInteger(best) && best >= 0 ? best : 0;
  } catch { return 0; }
}
function isTouchingRim(ballY: number, hoop: Hoop) {
  // The rim is allowed to be hit: touching cancels the clean-shot streak,
  // but is never a fatal collision.
  return [-RIM_RADIUS_X, RIM_RADIUS_X].some(dx =>
    Math.hypot(BALL_X - (hoop.x + dx), ballY - hoop.y) <= BALL_RADIUS + 5
  );
}
function drawHoop(ctx: CanvasRenderingContext2D, hoop: Hoop, front: boolean) {
  const color = hoop.blue ? '#4caaff' : '#ff9d3a';
  const glow = hoop.blue ? '#95e6ff' : '#ffcf62';
  ctx.save();
  ctx.globalAlpha = hoop.scored ? .42 : 1;
  // A net above the rim identifies blue reverse-direction hoops.
  if (!front) {
    const sign = hoop.blue ? -1 : 1;
    ctx.strokeStyle = hoop.blue ? '#9ae0ff' : '#f9e9c6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hoop.x - 31, hoop.y + sign * 4);
    ctx.lineTo(hoop.x - 23, hoop.y + sign * 38);
    ctx.lineTo(hoop.x + 23, hoop.y + sign * 38);
    ctx.lineTo(hoop.x + 31, hoop.y + sign * 4);
    ctx.moveTo(hoop.x - 23, hoop.y + sign * 38);
    ctx.lineTo(hoop.x + 13, hoop.y + sign * 6);
    ctx.moveTo(hoop.x + 23, hoop.y + sign * 38);
    ctx.lineTo(hoop.x - 13, hoop.y + sign * 6);
    ctx.moveTo(hoop.x - 12, hoop.y + sign * 4);
    ctx.lineTo(hoop.x + 10, hoop.y + sign * 37);
    ctx.moveTo(hoop.x + 12, hoop.y + sign * 4);
    ctx.lineTo(hoop.x - 10, hoop.y + sign * 37);
    ctx.stroke();
  }
  // The bottom half is drawn over the ball, for visible depth.
  ctx.beginPath();
  ctx.ellipse(hoop.x, hoop.y, RIM_RADIUS_X, RIM_RADIUS_Y, 0,
    front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
  ctx.strokeStyle = hoop.touched ? '#ff6974' : color;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(hoop.x, hoop.y, RIM_RADIUS_X, RIM_RADIUS_Y, 0,
    front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
  ctx.strokeStyle = glow;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (!front) {
    ctx.font = 'bold 17px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = hoop.blue ? '#b4edff' : '#ffe9b7';
    ctx.fillText(hoop.blue ? '↑' : '↓', hoop.x, hoop.y + (hoop.blue ? 61 : -34));
  }
  ctx.restore();
}
function drawBall(ctx: CanvasRenderingContext2D, y: number, rotation: number) {
  ctx.save();
  ctx.translate(BALL_X, y);
  ctx.rotate(rotation);
  ctx.fillStyle = '#e97323';
  ctx.strokeStyle = '#45211b';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-BALL_RADIUS, 0);
  ctx.lineTo(BALL_RADIUS, 0);
  ctx.moveTo(0, -BALL_RADIUS);
  ctx.lineTo(0, BALL_RADIUS);
  ctx.moveTo(-8, -9);
  ctx.bezierCurveTo(3, -2, 3, 2, -8, 9);
  ctx.moveTo(8, -9);
  ctx.bezierCurveTo(-3, -2, -3, 2, 8, 9);
  ctx.strokeStyle = '#4b261e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export default function Basketball({
  active, onEarn,
}: {
  active: boolean;
  onEarn: (amount: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(newGame());
  const earnRef = useRef(onEarn);
  const bestRef = useRef(savedBest());
  const [score, setScore] = useState(0);
  const [baskets, setBaskets] = useState(0);
  const [streak, setStreak] = useState(0);
  const [earned, setEarned] = useState(0);
  const [best, setBest] = useState(savedBest);
  const [over, setOver] = useState(false);
  const [lastText, setLastText] = useState('');

  useEffect(() => { earnRef.current = onEarn; }, [onEarn]);
  useEffect(() => {
    bestRef.current = best;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
  }, [best]);

  const flap = useCallback(() => {
    if (!active) return;
    let game = gameRef.current;
    if (!game.running) {
      if (game.over) {
        game = newGame();
        gameRef.current = game;
        setScore(0);
        setBaskets(0);
        setStreak(0);
        setEarned(0);
        setOver(false);
        setLastText('');
      }
      game.running = true;
    }
    game.velocity = FLAP_SPEED;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const handleKey = (event: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(event.code) &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, flap]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let previousTime = 0;

    function fail(game: Game, text: string) {
      if (game.over) return;
      game.failedBy = text;
      game.over = true;
      game.running = false;
      setOver(true);
      setLastText(text);
    }
    const tick = (time: number) => {
      const dt = Math.min(.034, Math.max(0, (time - (previousTime || time)) / 1000));
      previousTime = time;
      const game = gameRef.current;
      game.elapsed += dt;

      if (game.running && !game.over) {
        const oldY = game.y;
        game.velocity += GRAVITY * dt;
        game.y += game.velocity * dt;

        for (const hoop of game.hoops) {
          hoop.x -= SCROLL_SPEED * dt;
          const touch = isTouchingRim(game.y, hoop) || isTouchingRim(oldY, hoop);
          if (touch && !hoop.touched) {
            hoop.touched = true;
            if (game.streak) {
              game.streak = 0;
              setStreak(0);
              setLastText('ОБОД! Серия чистых попаданий сброшена');
            }
          }

          const crossesCorrectly = hoop.blue
            ? oldY > hoop.y - BALL_RADIUS && game.y <= hoop.y - BALL_RADIUS
            : oldY < hoop.y + BALL_RADIUS && game.y >= hoop.y + BALL_RADIUS;
          if (!hoop.scored && crossesCorrectly &&
              Math.abs(BALL_X - hoop.x) <= SCORING_HALF_WIDTH) {
            hoop.scored = true;
            const clean = !hoop.touched &&
              Math.abs(BALL_X - hoop.x) <= SCORING_HALF_WIDTH - BALL_RADIUS;
            const multiplier = clean ? Math.min(99, game.streak + 2) : 1;
            game.streak = clean ? game.streak + 1 : 0;
            game.baskets += 1;
            game.score += multiplier;
            const reward = BASE_COINS * multiplier;
            game.earned += reward;
            earnRef.current(reward);
            setBaskets(game.baskets);
            setScore(game.score);
            setStreak(game.streak);
            setEarned(game.earned);
            game.lastText = (hoop.blue ? '🔵 СНИЗУ ВВЕРХ' : '🏀 ПОПАДАНИЕ') +
              (clean ? ' · БЕЗ ОБОДА ×' + multiplier : ' · С КАСАНИЕМ ×1') +
              ' · +' + reward + ' 🪙';
            setLastText(game.lastText);
            if (game.score > bestRef.current) {
              bestRef.current = game.score;
              setBest(game.score);
            }
          }
        }

        // Missing a hoop ends the run, just like missing a gap in Flappy Bird.
        const missed = game.hoops.find(hoop =>
          !hoop.scored && hoop.x + RIM_RADIUS_X < BALL_X - BALL_RADIUS);
        if (missed) fail(game, missed.blue
          ? 'Синее кольцо пропущено: нужно пройти снизу вверх.'
          : 'Кольцо пропущено: нужно пройти сверху вниз.');

        game.hoops = game.hoops.filter(hoop => hoop.x > -RIM_RADIUS_X - 20);
        let rightmost = game.hoops[game.hoops.length - 1];
        if (rightmost && rightmost.x < WIDTH + 145) {
          game.hoops.push(randomHoop(rightmost, game.nextId++));
        }
        if (game.y <= BALL_RADIUS || game.y >= HEIGHT - 43 - BALL_RADIUS) {
          fail(game, 'Мяч коснулся границы площадки.');
        }
      }

      const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, '#193b70');
      sky.addColorStop(.68, '#276c98');
      sky.addColorStop(1, '#152847');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = 'rgba(237,246,255,.13)';
      for (let i = 0; i < 4; i++) {
        const x = ((i * 124 - game.elapsed * 15) % 510 + 510) % 510 - 60;
        ctx.beginPath();
        ctx.ellipse(x, 88 + i * 66, 42, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.17)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT - 43);
      ctx.lineTo(WIDTH, HEIGHT - 43);
      ctx.stroke();

      for (const hoop of game.hoops) drawHoop(ctx, hoop, false);
      drawBall(ctx, game.running || game.over
        ? game.y : game.y + Math.sin(game.elapsed * 2.8) * 5, game.elapsed * 2.5);
      for (const hoop of game.hoops) drawHoop(ctx, hoop, true);

      ctx.fillStyle = '#fff';
      ctx.font = '900 40px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#0c2045';
      ctx.lineWidth = 5;
      ctx.strokeText(String(game.score), WIDTH / 2, 62);
      ctx.fillText(String(game.score), WIDTH / 2, 62);
      if (game.streak > 0) {
        ctx.fillStyle = '#ffdb7b';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('ЧИСТАЯ СЕРИЯ ' + game.streak + ' · СЛЕД. ×' +
          Math.min(99, game.streak + 2), WIDTH / 2, 89);
      }
      if (!game.running) {
        ctx.fillStyle = 'rgba(8,18,37,.84)';
        ctx.fillRect(16, 170, WIDTH - 32, 171);
        ctx.fillStyle = '#fff';
        ctx.font = '900 23px Arial';
        ctx.fillText(game.over ? 'ИГРА ОКОНЧЕНА' : 'FLAPPY BASKET', WIDTH / 2, 212);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(game.over ? 'Нажми, чтобы начать заново' : 'Тап / пробел — подбросить мяч', WIDTH / 2, 250);
        ctx.fillStyle = '#fbc96c';
        ctx.fillText('🟠 Вниз · 🔵 Вверх', WIDTH / 2, 281);
        ctx.fillStyle = '#9df2ad';
        ctx.font = 'bold 13px Arial';
        ctx.fillText('Чистое попадание = ×2, ×3, ×4...', WIDTH / 2, 315);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return <div className="soloBasketball">
    <div className="soloStats">
      <span>ОЧКИ: <b>{score}</b></span>
      <span>КОЛЬЦА: <b>{baskets}</b></span>
      <span>СЕРИЯ: <b>{streak ? '×' + Math.min(99, streak + 1) : '×1'}</b></span>
      <span>МОНЕТЫ: <b>+{earned} 🪙</b></span>
      <span>РЕКОРД: <b>{best}</b></span>
    </div>
    <canvas ref={canvasRef} width={WIDTH} height={HEIGHT}
      role="button" aria-label="Баскетбол: нажимай, чтобы подбрасывать мяч"
      onPointerDown={flap} />
    <div className="basketballMessage" role="status">{lastText || 'Попади в кольцо, не касаясь обода, чтобы получить множитель ×2!'}</div>
    <div className="basketballRules">
      <span><b>🟠 ОРАНЖЕВОЕ</b> — сверху вниз ↓</span>
      <span><b>🔵 СИНЕЕ</b> — снизу вверх ↑</span>
      <span><b>🔥 ЧИСТО</b> — ×2, ×3, ×4…</span>
      <span><b>💥 ОБОД</b> — можно задеть, но серия сбросится</span>
    </div>
    <p className="soloNote">
      Управление: пробел, W, стрелка вверх или касание экрана. За кольцо +15 монет × множитель.
      Касания кольца не убивают и при попадании дают ×1; чистые попадания увеличивают серию.
      Пропущенное кольцо завершает попытку. Все монеты сохраняются.
    </p>
    {over && <p className="soloNote">Нажми на игровое поле для новой попытки.</p>}
  </div>;
}
