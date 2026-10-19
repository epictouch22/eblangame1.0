import React, { useCallback, useEffect, useRef, useState } from 'react';
import './soloArcade.css';
import Basketball from './Basketball';

const WALLET_KEY = 'eblangame.solo.wallet.v1';
const BEST_KEY = 'eblangame.solo.flappy.best.v1';
const MINES_KEY = 'eblangame.solo.mines.round.v1';
const MAX_WALLET = 1_000_000_000_000;
const MAX_BET = 50_000;
const PIPE_REWARD = 15;
const GRID_SIZE = 25;
const TIERS = [
  { id: 'easy', label: 'ЛЁГКАЯ', factor: 1.15, bombs: 3 },
  { id: 'normal', label: 'СРЕДНЯЯ', factor: 1.35, bombs: 6 },
  { id: 'hard', label: 'СЛОЖНАЯ', factor: 1.7, bombs: 9 },
  { id: 'extreme', label: 'ЭКСТРИМ', factor: 2.5, bombs: 13 },
] as const;

function readInteger(key: string) {
  try {
    const number = Number(localStorage.getItem(key) || '0');
    return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, MAX_WALLET) : 0;
  } catch {
    return 0;
  }
}

function coins(value: number) {
  return Math.floor(value).toLocaleString('ru-RU');
}

type Pipe = { x: number; middle: number; passed: boolean };
type Flight = {
  y: number;
  velocity: number;
  pipes: Pipe[];
  spawnIn: number;
  score: number;
  running: boolean;
  over: boolean;
  phase: number;
};

function newFlight(): Flight {
  return { y: 225, velocity: 0, pipes: [], spawnIn: 1.1, score: 0, running: false, over: false, phase: 0 };
}

function FlappyBird({ active, onEarn }: { active: boolean; onEarn: (amount: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flightRef = useRef<Flight>(newFlight());
  const earnRef = useRef(onEarn);
  const bestRef = useRef(readInteger(BEST_KEY));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => readInteger(BEST_KEY));
  const [over, setOver] = useState(false);

  useEffect(() => { earnRef.current = onEarn; }, [onEarn]);
  useEffect(() => {
    bestRef.current = best;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
  }, [best]);

  const flap = useCallback(() => {
    if (!active) return;
    let game = flightRef.current;
    if (!game.running) {
      if (game.over) {
        game = newFlight();
        flightRef.current = game;
        setScore(0);
        setOver(false);
      }
      game.running = true;
    }
    game.velocity = -330;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(event.code) &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, flap]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = 360;
    const height = 500;
    const ground = 451;
    const birdX = 99;
    const radius = 14;
    const gap = 152;
    const pipeWidth = 60;
    let last = 0;
    let frame = 0;

    const paintPipe = (x: number, y: number, h: number, upper: boolean) => {
      ctx.fillStyle = '#123b35';
      ctx.fillRect(x - 2, y, pipeWidth + 4, h);
      ctx.fillStyle = '#59df82';
      ctx.fillRect(x + 4, y, pipeWidth - 8, h);
      ctx.fillStyle = '#b6ffb6';
      ctx.fillRect(x + 9, y, 9, h);
      const capY = upper ? y + h - 19 : y;
      ctx.fillStyle = '#226d54';
      ctx.fillRect(x - 7, capY, pipeWidth + 14, 21);
      ctx.fillStyle = '#75f9a0';
      ctx.fillRect(x - 3, capY + 4, pipeWidth + 6, 11);
    };

    const tick = (timestamp: number) => {
      const dt = Math.min(0.034, Math.max(0, (timestamp - (last || timestamp)) / 1000));
      last = timestamp;
      const game = flightRef.current;
      game.phase += dt;
      if (game.running && !game.over) {
        game.velocity += 890 * dt;
        game.y += game.velocity * dt;
        game.spawnIn -= dt;
        if (game.spawnIn <= 0) {
          game.pipes.push({ x: width + 6, middle: 150 + Math.random() * 140, passed: false });
          game.spawnIn += 1.57;
        }
        for (const pipe of game.pipes) {
          pipe.x -= 156 * dt;
          if (!pipe.passed && pipe.x + pipeWidth < birdX - radius) {
            pipe.passed = true;
            game.score += 1;
            setScore(game.score);
            earnRef.current(PIPE_REWARD);
            if (game.score > bestRef.current) {
              bestRef.current = game.score;
              setBest(game.score);
            }
          }
          if (birdX + radius > pipe.x && birdX - radius < pipe.x + pipeWidth &&
              (game.y - radius < pipe.middle - gap / 2 || game.y + radius > pipe.middle + gap / 2)) {
            game.over = true;
          }
        }
        game.pipes = game.pipes.filter(pipe => pipe.x + pipeWidth > -10);
        if (game.y - radius < 0 || game.y + radius > ground) game.over = true;
        if (game.over) {
          game.running = false;
          setOver(true);
        }
      }

      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#176d92');
      sky.addColorStop(1, '#85d9df');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 4; i++) {
        const x = ((i * 122 - game.phase * 18) % 510 + 510) % 510 - 60;
        const y = 76 + i % 2 * 78;
        ctx.beginPath();
        ctx.ellipse(x, y, 35, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 16, y - 7, 22, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const pipe of game.pipes) {
        paintPipe(pipe.x, 0, pipe.middle - gap / 2, true);
        paintPipe(pipe.x, pipe.middle + gap / 2, ground - pipe.middle - gap / 2, false);
      }
      ctx.fillStyle = '#3b6f42';
      ctx.fillRect(0, ground, width, 9);
      ctx.fillStyle = '#d6b871';
      ctx.fillRect(0, ground + 9, width, height - ground - 9);
      ctx.fillStyle = '#b49a5d';
      for (let i = 0; i < 13; i++) ctx.fillRect(i * 35, ground + 17 + i % 2 * 12, 17, 4);

      ctx.save();
      ctx.translate(birdX, game.y);
      ctx.rotate(Math.max(-0.35, Math.min(0.85, game.velocity / 490)));
      ctx.fillStyle = '#ffda44';
      ctx.strokeStyle = '#443120';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5a623';
      ctx.beginPath();
      ctx.ellipse(-4, 5, 9, 5, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(6, -5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(8, -5, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fa7525';
      ctx.beginPath();
      ctx.moveTo(11, 1);
      ctx.lineTo(24, 5);
      ctx.lineTo(12, 9);
      ctx.fill();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.font = '900 42px Arial';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#173843';
      ctx.strokeText(String(game.score), width / 2, 66);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(game.score), width / 2, 66);
      if (!game.running) {
        ctx.fillStyle = 'rgba(8,27,31,.77)';
        ctx.fillRect(25, 170, 310, 144);
        ctx.fillStyle = '#fff';
        ctx.font = '900 23px Arial';
        ctx.fillText(game.over ? 'ИГРА ОКОНЧЕНА' : 'FLAPPY BIRD', width / 2, 215);
        ctx.font = 'bold 15px Arial';
        ctx.fillText(game.over ? 'Нажми, чтобы попробовать ещё' : 'Клик / пробел / касание — взлететь', width / 2, 251);
        ctx.fillStyle = '#59df82';
        ctx.fillText('+15 монет за каждую трубу', width / 2, 283);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return <div className="soloFlight">
    <div className="soloStats">
      <span>ПРОЙДЕНО: <b>{score}</b></span>
      <span>РЕКОРД: <b>{best}</b></span>
      <span>ЗА ТРУБУ: <b>+{PIPE_REWARD} 🪙</b></span>
    </div>
    <canvas ref={canvasRef} width={360} height={500} onPointerDown={flap}
      role="button" tabIndex={0} aria-label="Flappy Bird: нажми, чтобы взлететь" />
    <p className="soloNote">{over ? 'Столкнулся? Монеты за уже пройденные трубы остаются с тобой.' : 'Пробел, стрелка вверх, W или касание экрана. Пролетай между трубами, чтобы зарабатывать монеты.'}</p>
  </div>;
}

type MineRound = {
  bombs: number[];
  revealed: number[];
  stake: number;
  factor: number;
  bombCount: number;
  payout: number;
  finished: boolean;
  hit: number | null;
  outcome: 'lost' | 'won' | null;
};

function readMineRound(): MineRound | null {
  try {
    const value: MineRound = JSON.parse(localStorage.getItem(MINES_KEY) || 'null');
    if (!value || !Array.isArray(value.bombs) || !Array.isArray(value.revealed) ||
        !Number.isSafeInteger(value.stake) || value.stake < 1 || value.stake > MAX_BET ||
        !TIERS.some(t => t.bombs === value.bombCount && t.factor === value.factor) ||
        value.bombs.length !== value.bombCount ||
        new Set(value.bombs).size !== value.bombs.length ||
        new Set(value.revealed).size !== value.revealed.length ||
        ![...value.bombs, ...value.revealed].every(v => Number.isInteger(v) && v >= 0 && v < GRID_SIZE) ||
        typeof value.finished !== 'boolean' ||
        !Number.isSafeInteger(value.payout) || value.payout < 0) return null;
    return value;
  } catch {
    return null;
  }
}

function generateBombs(count: number): number[] {
  const values = Array.from({ length: GRID_SIZE }, (_, index) => index);
  for (let i = values.length - 1; i > 0; i--) {
    const random = new Uint32Array(1);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(random);
    else random[0] = Math.floor(Math.random() * 4294967296);
    const j = random[0] % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values.slice(0, count);
}

function Mines({ balance, onSpend, onEarn }: {
  balance: number;
  onSpend: (amount: number) => void;
  onEarn: (amount: number) => void;
}) {
  const [risk, setRisk] = useState<(typeof TIERS)[number]['id']>('normal');
  const [stakeText, setStakeText] = useState('50');
  const [round, setRound] = useState<MineRound | null>(readMineRound);
  const roundRef = useRef<MineRound | null>(round);
  const [error, setError] = useState('');
  const tier = TIERS.find(item => item.id === risk)!;
  const active = !!round && !round.finished;
  const diamonds = round?.revealed.filter(cell => !round.bombs.includes(cell)).length || 0;
  const updateRound = (next: MineRound) => {
    roundRef.current = next;
    setRound(next);
  };

  useEffect(() => {
    try {
      if (round) localStorage.setItem(MINES_KEY, JSON.stringify(round));
      else localStorage.removeItem(MINES_KEY);
    } catch {}
  }, [round]);

  const begin = () => {
    if (roundRef.current && !roundRef.current.finished) return;
    const stake = Number(stakeText);
    if (!Number.isSafeInteger(stake) || stake < 1 || stake > MAX_BET) {
      setError('Ставка должна быть целым числом от 1 до ' + coins(MAX_BET) + '.');
      return;
    }
    if (stake > balance) {
      setError('Не хватает монет. Заработай их во Flappy Bird или баскетболе.');
      return;
    }
    setError('');
    onSpend(stake);
    updateRound({
      bombs: generateBombs(tier.bombs), revealed: [], stake,
      factor: tier.factor, bombCount: tier.bombs, payout: stake,
      finished: false, hit: null, outcome: null,
    });
  };

  const reveal = (index: number) => {
    const current = roundRef.current;
    if (!current || current.finished || current.revealed.includes(index)) return;
    const revealed = [...current.revealed, index];
    if (current.bombs.includes(index)) {
      updateRound({ ...current, revealed, finished: true, hit: index, outcome: 'lost' });
      return;
    }
    const count = revealed.length;
    const payout = Math.min(MAX_WALLET, Math.floor(current.stake * Math.pow(current.factor, count)));
    const finished = count === GRID_SIZE - current.bombCount;
    updateRound({ ...current, revealed, payout, finished, outcome: finished ? 'won' : null });
    if (finished) onEarn(payout);
  };

  const cashOut = () => {
    const current = roundRef.current;
    if (!current || current.finished || current.revealed.length === 0) return;
    updateRound({ ...current, finished: true, outcome: 'won' });
    onEarn(current.payout);
  };

  return <div className="soloMines">
    <div className="soloMinesControls">
      <label>СЛОЖНОСТЬ И КОЭФФИЦИЕНТ
        <select value={risk} disabled={active} onChange={event => setRisk(event.target.value as typeof risk)}>
          {TIERS.map(item => <option key={item.id} value={item.id}>{item.label} · ×{item.factor} · 💣 {item.bombs}</option>)}
        </select>
      </label>
      <label>СТАВКА (МОНЕТЫ)
        <input type="number" min={1} max={MAX_BET} step={1} inputMode="numeric"
          disabled={active} value={stakeText} onChange={event => setStakeText(event.target.value)} />
      </label>
      <div className="soloMineActions">
        <button className="soloStart" disabled={active} onClick={begin}>⛏ {round?.finished ? 'НОВАЯ ШАХТА' : 'НАЧАТЬ'}</button>
        <button className="soloCashout" disabled={!active || diamonds === 0} onClick={cashOut}>💰 ЗАБРАТЬ {round && diamonds > 0 ? coins(round.payout) : ''}</button>
      </div>
      {error && <p className="soloError" role="alert">{error}</p>}
    </div>
    <div className="soloMineSummary" aria-live="polite">
      <div><small>БОМБЫ</small><b>{round?.bombCount ?? tier.bombs} 💣</b></div>
      <div><small>ЗА АЛМАЗ</small><b>×{round?.factor ?? tier.factor}</b></div>
      <div><small>АЛМАЗОВ</small><b>{diamonds}</b></div>
      <div><small>МОЖНО ЗАБРАТЬ</small><b>{active ? coins(round!.payout) : '—'} 🪙</b></div>
    </div>
    <div className="soloMineBoard" aria-label="Шахта 5 на 5">
      {Array.from({ length: GRID_SIZE }, (_, index) => {
        const isOpen = !!round?.revealed.includes(index);
        const bomb = !!round?.bombs.includes(index);
        const shown = isOpen || !!round?.finished;
        return <button key={index} type="button" disabled={!active || isOpen}
          onClick={() => reveal(index)}
          className={'soloMineCell' + (shown ? ' revealed' : '') + (shown && bomb ? ' bomb' : '') + (index === round?.hit ? ' exploded' : '')}
          aria-label={shown ? (bomb ? 'Бомба' : 'Алмаз') : 'Закрытая клетка ' + (index + 1)}>
          {shown ? (bomb ? '💣' : '💎') : '❔'}
        </button>;
      })}
    </div>
    {round?.finished && <div className={'soloMineResult ' + (round.outcome === 'won' ? 'won' : 'lost')} role="status">
      {round.outcome === 'won'
        ? '💎 Выигрыш: +' + coins(round.payout) + ' монет! Алмазов: ' + diamonds + '.'
        : '💥 Бомба! Ставка ' + coins(round.stake) + ' монет проиграна.'}
    </div>}
    {!round && <p className="soloNote">Сначала заработай монеты во Flappy Bird или баскетболе. Выбирай риск: чем выше коэффициент за алмаз, тем больше бомб на поле.</p>}
    <p className="soloNote">Каждый открытый алмаз умножает ставку ещё раз: ставка × коэффициент ^ число алмазов. Забирай выигрыш до попадания на бомбу. Игра только на виртуальные монеты.</p>
  </div>;
}

export default function SoloArcade() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'flappy' | 'basketball' | 'mines'>('flappy');
  const [balance, setBalance] = useState(() => readInteger(WALLET_KEY));

  useEffect(() => {
    try { localStorage.setItem(WALLET_KEY, String(balance)); } catch {}
  }, [balance]);

  const earn = useCallback((amount: number) => {
    if (Number.isSafeInteger(amount) && amount > 0) {
      setBalance(previous => Math.min(MAX_WALLET, previous + amount));
    }
  }, []);
  const spend = useCallback((amount: number) => {
    if (Number.isSafeInteger(amount) && amount > 0) {
      setBalance(previous => Math.max(0, previous - amount));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  return <>
    <button className="soloEntry" onClick={() => setOpen(true)}>
      <strong>🎮 ОДИНОЧНЫЕ ИГРЫ</strong>
      <span>🐤 Flappy Bird · 🏀 Баскетбол → 🪙 монеты → 💎 Шахта</span>
      <small>Баланс: {coins(balance)} 🪙 · ИГРАТЬ БЕЗ КОМНАТЫ →</small>
    </button>
    <div className="soloOverlay" style={{ display: open ? 'flex' : 'none' }} role="dialog"
      aria-modal="true" aria-label="Одиночные игры Еблангейм">
      <div className="soloWindow">
        <header className="soloHeader">
          <div><small>EBLANGAME ARCADE</small><h1>ОДИНОЧНЫЕ ИГРЫ</h1></div>
          <div className="soloHeaderRight"><span className="soloWallet">🪙 {coins(balance)}</span>
            <button className="soloClose" onClick={() => setOpen(false)} aria-label="Закрыть одиночные игры">✕</button>
          </div>
        </header>
        <nav className="soloTabs" aria-label="Выбор игры">
          <button className={tab === 'flappy' ? 'selected' : ''} onClick={() => setTab('flappy')}>🐤 FLAPPY BIRD <small>ЗАРАБОТАТЬ</small></button>
          <button className={tab === 'basketball' ? 'selected' : ''} onClick={() => setTab('basketball')}>🏀 БАСКЕТБОЛ <small>ЗАРАБОТАТЬ</small></button>
          <button className={tab === 'mines' ? 'selected' : ''} onClick={() => setTab('mines')}>💎 ШАХТА <small>РИСКНУТЬ</small></button>
        </nav>
        <div className="soloBody">
          <div style={{ display: tab === 'flappy' ? 'block' : 'none' }}><FlappyBird active={open && tab === 'flappy'} onEarn={earn} /></div>
          <div style={{ display: tab === 'basketball' ? 'block' : 'none' }}><Basketball active={open && tab === 'basketball'} onEarn={earn} /></div>
          <div style={{ display: tab === 'mines' ? 'block' : 'none' }}><Mines balance={balance} onSpend={spend} onEarn={earn} /></div>
        </div>
        <footer className="soloFooter">Виртуальные монеты · Без покупок и вывода денег · Прогресс хранится в этом браузере</footer>
      </div>
    </div>
  </>;
}
