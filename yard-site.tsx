import { useRef, useState } from "react";
import type { Mode, SpawnKind } from "@/game/yard-sim";

const ACTS = [
  { n: "01", title: "Клешня", text: "Хватай и кидай. Летит туда, куда смотришь.", tone: "claw" },
  { n: "02", title: "Рэгдолл", text: "Тело держится, потом разваливается по частям.", tone: "rag" },
  { n: "03", title: "Тачка", text: "Газ, занос, таран. Влево крутит влево.", tone: "car" },
  { n: "04", title: "Искра", text: "Красная бочка цепляет всё, что стоит рядом.", tone: "boom" },
] as const;

const GUNS = [
  { name: "ПМ", line: "Двенадцать в магазине." },
  { name: "Дробь", line: "Восемь дробин в упор." },
  { name: "Авто", line: "Очередь и копящаяся отдача." },
  { name: "Клешня", line: "Не стреляет. Держит." },
  { name: "Граната", line: "Дуга и пустой двор." },
  { name: "Лом", line: "Ближний, тяжёлый удар." },
] as const;

const TOOLS = [
  { name: "Взрыв", kind: "explosive" },
  { name: "Бочка", kind: "barrel" },
  { name: "Ящик", kind: "crate" },
  { name: "Шар", kind: "ball" },
  { name: "Блок", kind: "block" },
  { name: "Бот", kind: "bot" },
  { name: "Злые", kind: null },
  { name: "Слоу", kind: null },
  { name: "Ночь", kind: null },
] as const;

const TIMES = [
  { id: "dusk", label: "Закат" },
  { id: "night", label: "Ночь" },
  { id: "day", label: "День" },
] as const;

type TimeId = (typeof TIMES)[number]["id"];

export type YardWish = {
  mode: Mode;
  time: TimeId;
  slow: boolean;
  hostile: boolean;
  muted: boolean;
  weapon: number;
  kinds: SpawnKind[];
};

export function YardSite({ onPlay }: { onPlay: (wish: YardWish) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [time, setTime] = useState<TimeId>("dusk");
  const [act, setAct] = useState(0);
  const [gun, setGun] = useState(0);
  const [kit, setKit] = useState<string[]>(["Бочка", "Бот"]);
  const [muted, setMuted] = useState(false);
  const [leaving, setLeaving] = useState<Mode | null>(null);

  function go(i: number) {
    const slide = scroller.current?.children[i] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onScroll() {
    const root = scroller.current;
    if (!root) return;
    const next = Math.min(4, Math.max(0, Math.round(root.scrollTop / Math.max(1, root.clientHeight))));
    setIndex((prev) => (prev === next ? prev : next));
  }

  function enter(mode: Mode) {
    if (leaving) return;
    setLeaving(mode);
    const names = new Set(kit);
    const timeName: TimeId = names.has("Ночь") ? "night" : time;
    window.setTimeout(
      () =>
        onPlay({
          mode,
          time: timeName,
          slow: names.has("Слоу"),
          hostile: names.has("Злые"),
          muted,
          weapon: gun,
          kinds: TOOLS.flatMap((item) => (item.kind && names.has(item.name) ? [item.kind] : [])),
        }),
      720,
    );
  }

  function toggleKit(name: string) {
    setKit((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  return (
    <div className={`site time-${time}${muted ? " is-muted" : ""}`}>
      <div className="site-grain" aria-hidden />
      <header className="site-bar glass">
        <span className="font-display tracking-wide">СВАЛКА</span>
        <span className="text-muted">{String(index + 1).padStart(2, "0")} / 05</span>
        <button type="button" className={`glass-btn${muted ? " is-on" : ""}`} onClick={() => setMuted((v) => !v)}>
          {muted ? "Тихо" : "Звук"}
        </button>
        <button type="button" className="glass-btn glass-btn-hot" onClick={() => enter("sandbox")}>
          Играть
        </button>
      </header>

      <nav className="site-dots" aria-label="Секции">
        {[0, 1, 2, 3, 4].map((i) => (
          <button key={i} type="button" aria-label={`Секция ${i + 1}`} className={i === index ? "on" : ""} onClick={() => go(i)} />
        ))}
      </nav>

      <div
        ref={scroller}
        className="site-scroll"
        onScroll={onScroll}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "PageDown") {
            e.preventDefault();
            go(Math.min(4, index + 1));
          }
          if (e.key === "ArrowUp" || e.key === "PageUp") {
            e.preventDefault();
            go(Math.max(0, index - 1));
          }
        }}
      >
        <section className="site-slide site-hero">
          <p className="site-kicker">Физическая песочница</p>
          <h1 className="site-word">
            {"СВАЛКА".split("").map((ch, i) => (
              <span key={ch + i} style={{ animationDelay: `${i * 60}ms` }}>
                {ch}
              </span>
            ))}
          </h1>
          <div className="site-times">
            {TIMES.map((item) => (
              <button key={item.id} type="button" className={`glass-btn${time === item.id ? " is-on" : ""}`} onClick={() => setTime(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <YardArt />
          <div className="glass site-hero-card">
            <p>Рэгдоллы, клешня, тачка и цепные взрывы. Листай вниз или зайди сразу.</p>
            <div className="site-row">
              <button type="button" className="glass-btn glass-btn-hot" onClick={() => enter("sandbox")}>
                Песочница
              </button>
              <button type="button" className="glass-btn" onClick={() => enter("arena")}>
                Арена
              </button>
              <button type="button" className="glass-btn" onClick={() => go(1)}>
                Дальше
              </button>
            </div>
          </div>
        </section>

        <section className="site-slide">
          <p className="site-kicker">02 · Свайп вбок</p>
          <h2 className="site-h">Четыре способа устроить хаос</h2>
          <div className="site-rail">
            {ACTS.map((item, i) => (
              <button key={item.n} type="button" className={`site-card glass tone-${item.tone}${act === i ? " is-on" : ""}`} onClick={() => setAct(i)}>
                <span className="site-num">{item.n}</span>
                <ActMark tone={item.tone} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </button>
            ))}
          </div>
          <p className="glass site-note">Сейчас выбрано: {ACTS[act]!.title}. В игре это всё сразу, не по отдельности.</p>
        </section>

        <section className="site-slide">
          <p className="site-kicker">03 · Пояс</p>
          <h2 className="site-h">Шесть слотов. Листай.</h2>
          <div className="site-rail">
            {GUNS.map((item, i) => (
              <button key={item.name} type="button" className={`site-gun glass${gun === i ? " is-on" : ""}`} onClick={() => setGun(i)}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{item.name}</strong>
                <p>{item.line}</p>
              </button>
            ))}
          </div>
          <div className="site-row">
            <button type="button" className="glass-btn" onClick={() => setGun((v) => (v + 5) % 6)}>
              Назад
            </button>
            <button type="button" className="glass-btn glass-btn-hot" onClick={() => setGun((v) => (v + 1) % 6)}>
              Следующий слот
            </button>
            <button type="button" className="glass-btn" onClick={() => go(3)}>
              Пульт
            </button>
          </div>
        </section>

        <section className="site-slide">
          <p className="site-kicker">04 · Пульт</p>
          <h2 className="site-h">Собери набор на двор</h2>
          <div className="site-tools">
            {TOOLS.map((item) => (
              <button key={item.name} type="button" className={`glass-btn${kit.includes(item.name) ? " is-on" : ""}`} onClick={() => toggleKit(item.name)}>
                {item.name}
              </button>
            ))}
          </div>
          <p className="glass site-note">{kit.length ? kit.join(" · ") : "Пусто. Нажми, что тащить с собой."}</p>
          <div className="site-row">
            <button type="button" className="glass-btn" onClick={() => setKit([])}>
              Очистить
            </button>
            <button type="button" className="glass-btn" onClick={() => setKit(TOOLS.map((item) => item.name))}>
              Всё
            </button>
            <button type="button" className="glass-btn glass-btn-hot" onClick={() => enter("sandbox")}>
              На двор
            </button>
          </div>
        </section>

        <section className="site-slide site-last">
          <p className="site-kicker">05 · Вход</p>
          <h2 className="site-h">Куда заходишь</h2>
          <div className="site-modes">
            <button type="button" className="site-mode glass mode-sand" onClick={() => enter("sandbox")}>
              <span>Свободно</span>
              <strong>Песочница</strong>
              <em>Спавнь что хочешь. Патроны не кончаются.</em>
            </button>
            <button type="button" className="site-mode glass mode-arena" onClick={() => enter("arena")}>
              <span>Волны</span>
              <strong>Арена</strong>
              <em>Манекены стреляют в ответ.</em>
            </button>
          </div>
          <p className="site-hint">Телефон: стик слева, взгляд справа. Компьютер: WASD, мышь, F — тачка, E — бросок.</p>
          <button type="button" className="glass-btn" onClick={() => go(0)}>
            Наверх
          </button>
        </section>
      </div>

      <div className="site-dock glass">
        {(
          [
            ["Двор", 0],
            ["Хаос", 1],
            ["Пояс", 2],
            ["Пульт", 3],
            ["Вход", 4],
          ] as const
        ).map(([label, i]) => (
          <button key={label} type="button" className={`glass-btn${index === i ? " is-on" : ""}`} onClick={() => go(i)}>
            {label}
          </button>
        ))}
      </div>

      {leaving && (
        <div className="site-veil" role="status">
          <p className="font-display">{leaving === "arena" ? "Арена" : "Песочница"}</p>
          <span>Собираем двор</span>
        </div>
      )}
    </div>
  );
}

function ActMark({ tone }: { tone: string }) {
  if (tone === "claw") {
    return (
      <svg className="site-mark" viewBox="0 0 120 72" aria-hidden>
        <path d="M18 58c18-28 28-40 42-40s24 12 42 40" />
        <path d="M46 28l-8 22M74 28l8 22" />
      </svg>
    );
  }
  if (tone === "rag") {
    return (
      <svg className="site-mark" viewBox="0 0 120 72" aria-hidden>
        <circle cx="60" cy="16" r="8" />
        <path d="M60 24v22M60 34l-18 14M60 34l16 16M60 46l-12 18M60 46l14 16" />
      </svg>
    );
  }
  if (tone === "car") {
    return (
      <svg className="site-mark" viewBox="0 0 120 72" aria-hidden>
        <path d="M14 46h92l-8-16H38L22 46z" />
        <circle cx="36" cy="50" r="7" />
        <circle cx="86" cy="50" r="7" />
      </svg>
    );
  }
  return (
    <svg className="site-mark" viewBox="0 0 120 72" aria-hidden>
      <circle cx="60" cy="36" r="10" />
      <path d="M60 8v10M60 54v10M32 36H18M102 36H88M38 16l8 8M82 16l-8 8M38 56l8-8M82 56l-8-8" />
    </svg>
  );
}

function YardArt() {
  return (
    <svg className="site-art" viewBox="0 0 640 360" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a211c" />
          <stop offset="0.55" stopColor="#6a3a28" />
          <stop offset="1" stopColor="#e25b1a" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#sky)" />
      <g className="site-sun">
        <circle cx="470" cy="118" r="38" />
      </g>
      <g className="site-crane">
        <rect x="92" y="78" width="10" height="168" />
        <rect x="70" y="78" width="210" height="8" />
        <rect x="248" y="86" width="3" height="46" className="site-cable" />
        <path d="M236 132h28l-4 10h-20z" />
      </g>
      <g className="site-stack">
        <rect x="150" y="168" width="92" height="58" />
        <rect x="168" y="128" width="78" height="40" />
        <rect x="248" y="150" width="70" height="76" />
      </g>
      <g className="site-truck">
        <path d="M390 214h150l-16-36H430l-22 36z" />
        <circle cx="430" cy="226" r="14" />
        <circle cx="512" cy="226" r="14" />
      </g>
      <g className="site-barrel">
        <ellipse cx="340" cy="214" rx="18" ry="7" />
        <rect x="322" y="176" width="36" height="40" rx="4" />
        <ellipse cx="340" cy="176" rx="18" ry="7" />
      </g>
      <rect y="230" width="640" height="130" className="site-ground" />
      <g className="site-smoke">
        <circle cx="300" cy="150" r="10" />
        <circle cx="318" cy="132" r="14" />
        <circle cx="338" cy="118" r="18" />
      </g>
    </svg>
  );
}
