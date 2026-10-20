import React, { useCallback, useEffect, useRef, useState } from 'react';
import './rocket.css';

const HISTORY_KEY = 'eblangame.solo.rocket.history.v1';
const MAX_BET = 50_000;
const MAX_WALLET = 1_000_000_000_000;
const MAX_MULTIPLIER = 100;
const GROWTH_PER_SECOND = 0.17;

type Flight = {
  stake: number;
  startedAt: number;
  crashAt: number;
  autoAt: number | null;
};
type Phase = 'ready' | 'flying' | 'crashed' | 'cashed';

function formatCoins(value: number) {
  return Math.floor(value).toLocaleString('ru-RU');
}
function formatFactor(value: number) {
  return '×' + value.toFixed(2);
}
function readHistory(): number[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(values)
      ? values.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= MAX_MULTIPLIER).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

// Demo-only local RNG: no purchases, deposits or real-money withdrawals.
function randomCrashPoint(): number {
  let random = Math.random();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    random = value[0] / 4294967296;
  }
  return Math.max(1, Math.min(MAX_MULTIPLIER, Math.floor(0.98 / (1 - random) * 100) / 100));
}
function elapsedFactor(flight: Flight): number {
  const elapsed = Math.max(0, (Date.now() - flight.startedAt) / 1000);
  return Math.min(MAX_MULTIPLIER, Math.exp(elapsed * GROWTH_PER_SECOND));
}

export default function Rocket({ balance, onSpend, onEarn }: {
  balance: number;
  onSpend: (amount: number) => void;
  onEarn: (amount: number) => void;
}) {
  const flightRef = useRef<Flight | null>(null);
  const earnRef = useRef(onEarn);
  const [bet, setBet] = useState('50');
  const [auto, setAuto] = useState('');
  const [phase, setPhase] = useState<Phase>('ready');
  const [factor, setFactor] = useState(1);
  const [activeStake, setActiveStake] = useState(0);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<number[]>(readHistory);

  useEffect(() => { earnRef.current = onEarn; }, [onEarn]);
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }, [history]);

  const settle = useCallback((flight: Flight, crashed: boolean, exitFactor?: number) => {
    if (flightRef.current !== flight) return;
    flightRef.current = null; // prevents double payment from buttons and animation frames
    if (crashed) {
      setFactor(flight.crashAt);
      setPhase('crashed');
      setResult('💥 Ракета взорвалась на ' + formatFactor(flight.crashAt) + '. Ставка ' + formatCoins(flight.stake) + ' 🪙 сгорела.');
      setHistory(previous => [flight.crashAt, ...previous].slice(0, 12));
    } else {
      const multiplier = Math.min(MAX_MULTIPLIER, Math.max(1, exitFactor ?? 1));
      const payout = Math.min(MAX_WALLET, Math.floor(flight.stake * multiplier));
      earnRef.current(payout);
      setFactor(multiplier);
      setPhase('cashed');
      setResult('✅ Забрано ' + formatCoins(payout) + ' 🪙 на ' + formatFactor(multiplier) +
        ' (прибыль ' + formatCoins(payout - flight.stake) + ' 🪙).');
    }
  }, []);

  const checkFlight = useCallback(() => {
    const flight = flightRef.current;
    if (!flight) return;
    const exact = elapsedFactor(flight);
    // Auto-cashout happens at its threshold even if the browser paused animation.
    if (flight.autoAt !== null && flight.autoAt < flight.crashAt && exact >= flight.autoAt) {
      settle(flight, false, flight.autoAt);
    } else if (exact >= flight.crashAt) {
      settle(flight, true);
    } else {
      setFactor(Math.max(1, Math.floor(exact * 100) / 100));
    }
  }, [settle]);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      checkFlight();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const onVisible = () => checkFlight();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkFlight]);

  const start = () => {
    if (flightRef.current) return;
    const stake = Number(bet);
    if (!Number.isSafeInteger(stake) || stake < 1 || stake > MAX_BET) {
      setError('Ставка должна быть целым числом от 1 до ' + formatCoins(MAX_BET) + '.');
      return;
    }
    if (stake > balance) {
      setError('Недостаточно монет. Заработай их во Flappy Bird или баскетболе.');
      return;
    }
    const autoFactor = auto.trim() === '' ? null : Number(auto.replace(',', '.'));
    if (autoFactor !== null && (!Number.isFinite(autoFactor) || autoFactor < 1.01 || autoFactor > MAX_MULTIPLIER)) {
      setError('Автовывод: укажи коэффициент от 1.01 до 100.00 или оставь поле пустым.');
      return;
    }
    setError('');
    setResult('');
    setActiveStake(stake);
    setFactor(1);
    setPhase('flying');
    const flight: Flight = {
      stake,
      startedAt: Date.now(),
      crashAt: randomCrashPoint(),
      autoAt: autoFactor === null ? null : Math.floor(autoFactor * 100) / 100,
    };
    flightRef.current = flight;
    onSpend(stake);
    checkFlight();
  };

  const cashOut = () => {
    const flight = flightRef.current;
    if (!flight) return;
    const exact = elapsedFactor(flight);
    if (flight.autoAt !== null && flight.autoAt < flight.crashAt && exact >= flight.autoAt) {
      settle(flight, false, flight.autoAt);
    } else if (exact >= flight.crashAt) {
      settle(flight, true);
    } else {
      settle(flight, false, Math.floor(exact * 100) / 100);
    }
  };

  const isFlying = phase === 'flying';
  const elapsed = Math.log(Math.max(1, factor)) / GROWTH_PER_SECOND;
  const visibleSeconds = Math.max(6, elapsed * 1.25);
  const heightFactor = Math.exp(visibleSeconds * GROWTH_PER_SECOND);
  const coords = Array.from({ length: 61 }, (_, i) => {
    const t = elapsed * i / 60;
    return {
      x: 35 + (t / visibleSeconds) * 528,
      y: 264 - ((Math.exp(t * GROWTH_PER_SECOND) - 1) / (heightFactor - 1)) * 192,
    };
  });
  const last = coords[coords.length - 1];
  const path = coords.map((point, index) => (index === 0 ? 'M' : 'L') + point.x.toFixed(2) + ' ' + point.y.toFixed(2)).join(' ');
  const area = path + ' L ' + last.x.toFixed(2) + ' 264 Z';
  const preview = Math.floor(activeStake * factor);

  return <div className="rocketGame">
    <div className={'rocketStage ' + (phase === 'crashed' ? 'rocketCrash' : '')}>
      <div className="rocketStageTop">
        <span>{phase === 'flying' ? '🚀 В ПОЛЁТЕ' : phase === 'crashed' ? '💥 CRASH!' : phase === 'cashed' ? '✅ ВЫВЕДЕНО' : '🚀 ГОТОВ К ЗАПУСКУ'}</span>
        <strong>{formatFactor(factor)}</strong>
        <small>{isFlying ? 'Успей забрать монеты до взрыва' : phase === 'ready' ? 'Коэффициент увеличивается во время полёта' : 'Запусти новую ракету'}</small>
      </div>
      <svg className="rocketChart" viewBox="0 0 600 300" role="img" aria-label={'График полёта, коэффициент ' + formatFactor(factor)}>
        <defs>
          <linearGradient id="rocket-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#57e9ba" stopOpacity=".32" />
            <stop offset="100%" stopColor="#57e9ba" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[75, 140, 205, 264].map(y => <line key={y} x1="25" y1={y} x2="580" y2={y} stroke="#385060" strokeDasharray="4 8" />)}
        <path d={area} fill="url(#rocket-chart-fill)" />
        <path d={path} stroke={phase === 'crashed' ? '#ff667d' : '#59eab1'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx={last.x} cy={last.y} r="10" fill={phase === 'crashed' ? '#ff667d' : '#59eab1'} opacity=".3" />
        <text x={last.x} y={last.y - 11} fontSize="37" textAnchor="middle">{phase === 'crashed' ? '💥' : '🚀'}</text>
      </svg>
      <div className="rocketStageBottom"><span>СТАРТ ×1.00</span><span>МАКСИМУМ ×100.00</span></div>
    </div>

    <div className="rocketControls">
      <label>СТАВКА (🪙)
        <input type="number" min="1" max={MAX_BET} step="1" inputMode="numeric"
          disabled={isFlying} value={bet} onChange={event => setBet(event.target.value)} />
      </label>
      <label>АВТОВЫВОД (НЕОБЯЗАТЕЛЬНО)
        <input type="text" inputMode="decimal" placeholder="Например, 2.00"
          disabled={isFlying} value={auto} onChange={event => setAuto(event.target.value)} />
      </label>
      <div className="rocketButtons">
        <button type="button" className="rocketLaunch" disabled={isFlying} onClick={start}>🚀 {phase === 'ready' ? 'ЗАПУСТИТЬ' : 'НОВЫЙ ЗАПУСК'}</button>
        <button type="button" className="rocketCollect" disabled={!isFlying} onClick={cashOut}>💰 ЗАБРАТЬ {isFlying ? formatCoins(preview) + ' 🪙' : ''}</button>
      </div>
      {error && <p className="rocketError" role="alert">{error}</p>}
    </div>
    {result && <div className={'rocketResult ' + (phase === 'cashed' ? 'rocketWin' : '')} role="status">{result}</div>}
    <div className="rocketHistory"><strong>ПОСЛЕДНИЕ КРАШИ</strong><div>{history.length
      ? history.map((point, index) => <span key={index} className={point >= 2 ? 'rocketHigh' : ''}>{formatFactor(point)}</span>)
      : <small>История появится после первой игры</small>}</div></div>
    <p className="soloNote">Поставь виртуальные монеты, запусти ракету и нажми «Забрать» до взрыва. Выигрыш = ставка × коэффициент. Автовывод сработает, только если ракета достигнет выбранного коэффициента до краша. Монеты можно заработать во Flappy Bird и баскетболе. Игра без реальных денег.</p>
  </div>;
}
