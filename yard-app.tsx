import { useEffect, useRef, useState } from "react";
import {
  Bomb,
  Box,
  Car,
  Circle,
  Crosshair,
  Hand,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sun,
  User,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import type { HudSnapshot, Mode, SpawnKind, TouchState, YardSim } from "@/game/yard-sim";
import { WEAPON_SLOTS } from "@/game/yard-sim";

const EMPTY: HudSnapshot = {
  playing: false,
  paused: false,
  mode: "sandbox",
  hp: 100,
  mag: 12,
  reserve: 72,
  weapon: 0,
  weaponName: "Пистолет",
  showAmmo: true,
  wave: 1,
  kills: 0,
  chaos: 0,
  hint: "",
  hit: false,
  hurt: 0,
  driving: false,
  time: "dusk",
  hostile: false,
  slow: false,
  grabbed: false,
  down: false,
  spread: 0.02,
  bestWave: 0,
  bestChaos: 0,
  muted: false,
  lamp: false,
  carHp: 140,
};

const SPAWNS: { id: SpawnKind; label: string; icon: typeof Box }[] = [
  { id: "explosive", label: "Взрыв", icon: Bomb },
  { id: "barrel", label: "Бочка", icon: Circle },
  { id: "crate", label: "Ящик", icon: Box },
  { id: "ball", label: "Шар", icon: Circle },
  { id: "block", label: "Блок", icon: Box },
  { id: "bot", label: "Бот", icon: User },
];

export function YardApp({ boot, onExit, wish }: { boot?: Mode; onExit?: () => void; wish?: { time: "day" | "dusk" | "night"; slow: boolean; hostile: boolean; muted: boolean; weapon: number; kinds: SpawnKind[] } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<YardSim | null>(null);
  const touchRef = useRef<TouchState>({ moveX: 0, moveY: 0, fire: false, jump: false, use: false });
  const [hud, setHud] = useState<HudSnapshot>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [stick, setStick] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let sim: YardSim | null = null;
    void import("@/game/yard-sim").then(({ YardSim: Sim }) => {
      if (dead) return;
      try {
        sim = new Sim();
        sim.mount(canvas, setHud, touchRef.current);
        simRef.current = sim;
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Двор не собрался");
      }
    });
    return () => {
      dead = true;
      sim?.dispose();
      simRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !boot) return;
    simRef.current?.unlock();
    simRef.current?.begin(boot);
    if (wish) simRef.current?.applyWish(wish);
  }, [ready, boot, wish]);

  function start(mode: Mode) {
    simRef.current?.unlock();
    simRef.current?.begin(mode);
  }

  const hurt = Math.max(hud.hurt, hud.hp < 32 ? (32 - hud.hp) / 40 : 0);

  return (
    <main className="yard relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Свалка, трёхмерная песочница" />

      {hud.playing && !hud.paused && !hud.driving && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(-50%, -50%) scale(${1 + Math.min(1.4, hud.spread * 10)})` }}
          >
            <Crosshair className="size-7 text-fg opacity-80" strokeWidth={1.5} />
          </div>
          {hud.hit && <div className="absolute left-1/2 top-1/2 size-4 -translate-1/2 rotate-45 border-2 border-accent" />}
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{ boxShadow: `inset 0 0 140px rgba(215, 38, 61, ${hurt * 0.72})` }}
      />

      {hud.playing && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="pointer-events-auto min-w-40 rounded-xl border border-border bg-surface px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>{hud.mode === "arena" ? `Волна ${hud.wave}` : "Песочница"}</span>
                <span>{hud.kills} сбито</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-accent" style={{ width: `${hud.hp}%` }} />
              </div>
              <p className="mt-1 font-display text-sm tracking-wide">{hud.weaponName}</p>
              <p className="text-xs text-muted">
                {hud.showAmmo ? `${hud.mag} / ${hud.reserve}` : hud.grabbed ? "Держит" : "—"}
                {hud.driving ? ` · тачка ${hud.carHp}` : ""}
              </p>
            </div>
            <div className="pointer-events-auto flex gap-2">
              <IconBtn label={hud.muted ? "Звук" : "Тише"} onClick={() => simRef.current?.toggleMute()}>
                {hud.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </IconBtn>
              <IconBtn label="Пауза" onClick={() => simRef.current?.togglePause()}>
                <Pause className="size-5" />
              </IconBtn>
            </div>
          </div>

          {hud.hint && (
            <p className="pointer-events-none mx-auto rounded-full border border-border bg-surface px-4 py-1 text-sm">{hud.hint}</p>
          )}

          <div className="mt-auto safe-b flex flex-col gap-2 p-3">
            {hud.mode === "sandbox" && !hud.driving && (
              <div className="scroll-x pointer-events-auto flex gap-2 pb-1">
                {SPAWNS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm"
                    onClick={() => simRef.current?.spawnKind(s.id)}
                  >
                    <s.icon className="size-4 text-primary" />
                    {s.label}
                  </button>
                ))}
                <button type="button" className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm" onClick={() => simRef.current?.toggleHostile()}>
                  <Zap className="size-4 text-accent" />
                  {hud.hostile ? "Злые" : "Мирные"}
                </button>
                <button type="button" className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm" onClick={() => simRef.current?.cycleTime()}>
                  {hud.time === "night" ? <Moon className="size-4" /> : <Sun className="size-4 text-primary" />}
                  Время
                </button>
                <button type="button" className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm" onClick={() => simRef.current?.toggleSlow()}>
                  {hud.slow ? "Слоу" : "Темп"}
                </button>
                <button type="button" className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm" onClick={() => simRef.current?.clearMess()}>
                  <RotateCcw className="size-4" />
                  Сброс
                </button>
              </div>
            )}

            <div className="pointer-events-auto flex justify-center gap-1">
              {WEAPON_SLOTS.map((w, i) => (
                <button
                  key={w.short}
                  type="button"
                  className={`h-12 min-w-14 rounded-lg px-2 text-xs ${i === hud.weapon ? "bg-primary text-bg" : "border border-border bg-surface text-fg"}`}
                  onClick={() => simRef.current?.setWeapon(i)}
                >
                  {w.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hud.playing && !hud.paused && (
        <div className="absolute inset-0 z-20 md:hidden">
          <Stick
            x={stick.x}
            y={stick.y}
            onChange={(x, y) => {
              touchRef.current.moveX = x;
              touchRef.current.moveY = y;
              setStick({ x, y });
            }}
          />
          <div
            className="absolute top-0 right-0 bottom-36 left-1/2"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              (e.currentTarget as HTMLDivElement).dataset.x = String(e.clientX);
              (e.currentTarget as HTMLDivElement).dataset.y = String(e.clientY);
            }}
            onPointerMove={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              if (!el.hasPointerCapture(e.pointerId)) return;
              const lx = Number(el.dataset.x || e.clientX);
              const ly = Number(el.dataset.y || e.clientY);
              simRef.current?.addLook(e.clientX - lx, e.clientY - ly);
              el.dataset.x = String(e.clientX);
              el.dataset.y = String(e.clientY);
            }}
          />
          <div className="absolute right-3 bottom-36 flex flex-col gap-2">
            <Hold label="Огонь" onHold={(v) => (touchRef.current.fire = v)}>
              <Crosshair className="size-6" />
            </Hold>
            <Hold label="Прыжок" onHold={(v) => (touchRef.current.jump = v)}>
              <span className="font-display text-sm">ПРЫЖ</span>
            </Hold>
            <Hold label="Действие" onHold={(v) => (touchRef.current.use = v)}>
              {hud.driving ? <Car className="size-6" /> : hud.grabbed ? <Hand className="size-6" /> : <Hand className="size-6" />}
            </Hold>
          </div>
        </div>
      )}

      {!hud.playing && boot && (
        <p className="absolute inset-0 z-40 grid place-items-center bg-bg font-display text-2xl">Собираем двор…</p>
      )}

      {!hud.playing && !boot && (
        <section className="absolute inset-x-0 bottom-0 z-40 max-h-[78%] overflow-auto border-t border-border bg-surface md:inset-y-0 md:right-auto md:w-96 md:max-h-none md:border-t-0 md:border-r">
          <div className="hazard h-2" />
          <div className="safe-b flex flex-col gap-4 p-5">
            <p className="text-xs tracking-[0.22em] text-primary">ФИЗИЧЕСКАЯ ПЕСОЧНИЦА</p>
            <h1 className="font-display text-5xl leading-none tracking-wide">СВАЛКА</h1>
            <p className="text-sm leading-relaxed text-muted">
              Рэгдоллы, клешня, тачка и цепные взрывы. Песочница без правил — или арена, где манекены стреляют в ответ.
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Fact title="Клешня" text="Хватай и швыряй" />
              <Fact title="Рэгдолл" text="Тело разваливается" />
              <Fact title="Тачка" text="F, газ и занос" />
              <Fact title="Бочки" text="Одна искра — двор" />
            </div>
            {error && <p className="text-sm text-accent">{error}</p>}
            <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-display tracking-wide text-bg" onClick={() => start("sandbox")} disabled={!ready}>
              <Play className="size-5" />
              Песочница
            </button>
            <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-bg font-display tracking-wide" onClick={() => start("arena")} disabled={!ready}>
              <Crosshair className="size-5 text-accent" />
              Арена
            </button>
            <p className="text-xs leading-relaxed text-muted">
              ПК: WASD, мышь, ЛКМ, колесо — оружие, F — тачка, E — бросок, C — слоу, N — время. Телефон: стик слева, взгляд справа.
            </p>
            {(hud.bestChaos > 0 || hud.bestWave > 0) && (
              <p className="text-xs text-muted">
                Рекорд хаоса {hud.bestChaos}
                {hud.bestWave > 1 ? ` · волна ${hud.bestWave}` : ""}
              </p>
            )}
            {!ready && !error && <p className="text-xs text-muted">Собираем двор…</p>}
          </div>
        </section>
      )}

      {hud.paused && (
        <section className="absolute inset-0 z-40 flex items-end justify-center bg-bg/80 md:items-center">
          <div className="safe-b w-full max-w-md border border-border bg-surface p-5 md:rounded-2xl">
            <h2 className="font-display text-3xl tracking-wide">Пауза</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
              <li>WASD — бег</li>
              <li>Мышь — взгляд</li>
              <li>ЛКМ — огонь</li>
              <li>ПКМ — прицел / лёд</li>
              <li>F — тачка</li>
              <li>E — бросок</li>
              <li>1–6 — оружие</li>
              <li>X — удалить</li>
            </ul>
            <button type="button" className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-display text-bg" onClick={() => simRef.current?.togglePause()}>
              Дальше
            </button>
            <button
              type="button"
              className="mt-2 flex h-12 w-full items-center justify-center rounded-xl border border-border"
              onClick={() => {
                simRef.current?.togglePause();
                start(hud.mode);
              }}
            >
              Заново
            </button>
            {onExit && (
              <button type="button" className="mt-2 flex h-12 w-full items-center justify-center rounded-xl border border-border" onClick={() => onExit()}>
                К витрине
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function Fact({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2">
      <p className="font-display text-sm tracking-wide">{title}</p>
      <p className="text-xs text-muted">{text}</p>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} className="flex size-12 items-center justify-center rounded-xl border border-border bg-surface" onClick={onClick}>
      {children}
    </button>
  );
}

function Hold({ label, onHold, children }: { label: string; onHold: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-14 items-center justify-center rounded-full border border-border bg-surface/90 text-fg"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {children}
    </button>
  );
}

function Stick({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const read = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    let nx = ((cx - r.left) / r.width) * 2 - 1;
    let ny = -(((cy - r.top) / r.height) * 2 - 1);
    const len = Math.hypot(nx, ny) || 1;
    const k = Math.min(1, len);
    nx = (nx / len) * k;
    ny = (ny / len) * k;
    onChange(nx, ny);
  };
  return (
    <div
      ref={ref}
      className="absolute bottom-36 left-4 size-32 rounded-full border border-border bg-surface/70"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        read(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        read(e.clientX, e.clientY);
      }}
      onPointerUp={() => onChange(0, 0)}
      onPointerCancel={() => onChange(0, 0)}
    >
      <div
        className="absolute size-12 rounded-full bg-primary"
        style={{ left: `${50 + x * 28}%`, top: `${50 - y * 28}%`, transform: "translate(-50%, -50%)" }}
      />
    </div>
  );
}
