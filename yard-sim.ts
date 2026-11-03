import * as CANNON from "cannon-es";
import * as THREE from "three";

export type TimeName = "day" | "dusk" | "night";
export type Mode = "sandbox" | "arena";
export type SpawnKind = "barrel" | "explosive" | "crate" | "ball" | "block" | "bot";

export type HudSnapshot = {
  playing: boolean;
  paused: boolean;
  mode: Mode;
  hp: number;
  mag: number;
  reserve: number;
  weapon: number;
  weaponName: string;
  showAmmo: boolean;
  wave: number;
  kills: number;
  chaos: number;
  hint: string;
  hit: boolean;
  hurt: number;
  driving: boolean;
  time: TimeName;
  hostile: boolean;
  slow: boolean;
  grabbed: boolean;
  down: boolean;
  spread: number;
  bestWave: number;
  bestChaos: number;
  muted: boolean;
  lamp: boolean;
  carHp: number;
};

export type TouchState = {
  moveX: number;
  moveY: number;
  fire: boolean;
  jump: boolean;
  use: boolean;
};

export const WEAPON_SLOTS = [
  { name: "Пистолет", short: "ПМ", kind: "gun", mag: 12, reserve: 72, cooldown: 0.2, reload: 1.05, auto: false, dmg: 28, force: 5, range: 70, spread: 0.012, pellets: 1, recoil: 0.02, shake: 0.12 },
  { name: "Дробовик", short: "Дробь", kind: "gun", mag: 6, reserve: 30, cooldown: 0.72, reload: 1.5, auto: false, dmg: 12, force: 3.2, range: 26, spread: 0.09, pellets: 8, recoil: 0.045, shake: 0.32 },
  { name: "Автомат", short: "Авто", kind: "gun", mag: 30, reserve: 120, cooldown: 0.09, reload: 1.35, auto: true, dmg: 15, force: 2.4, range: 80, spread: 0.022, pellets: 1, recoil: 0.012, shake: 0.07 },
  { name: "Клешня", short: "Клешня", kind: "claw", mag: 0, reserve: 0, cooldown: 0.1, reload: 0, auto: false, dmg: 0, force: 0, range: 6, spread: 0, pellets: 1, recoil: 0, shake: 0 },
  { name: "Граната", short: "Граната", kind: "nade", mag: 1, reserve: 6, cooldown: 0.7, reload: 0.4, auto: false, dmg: 0, force: 0, range: 0, spread: 0, pellets: 1, recoil: 0, shake: 0.08 },
  { name: "Лом", short: "Лом", kind: "melee", mag: 0, reserve: 0, cooldown: 0.42, reload: 0, auto: false, dmg: 46, force: 9, range: 2.3, spread: 0, pellets: 1, recoil: 0, shake: 0.12 },
] as const;

const EYE = 1.62;
const PR = 0.36;

type Kind = "crate" | "barrel" | "explosive" | "ball" | "block" | "chip" | "limb" | "nade";

type Dyn = {
  body: CANNON.Body;
  mesh: THREE.Object3D;
  kind: Kind;
  hp: number;
  dead: boolean;
  removed: boolean;
  links: CANNON.Constraint[];
  fuse: number;
  pinnedMass: number;
};

type Bot = {
  id: number;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  mesh: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  headMat: THREE.MeshLambertMaterial;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  body: CANNON.Body;
  cool: number;
  wander: number;
  flash: number;
  hostile: boolean;
};

type StaticBox = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

type DynOpts = {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  mass: number;
  color: string;
  hp: number;
  sphere?: boolean;
  cyl?: boolean;
  emissive?: string;
  bouncy?: boolean;
  fuse?: number;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const TIMES: Record<TimeName, { top: string; mid: string; fog: string; sun: string; sunI: number; hemi: string; ground: string; hemiI: number; exp: number; sx: number; sy: number; sz: number }> = {
  day: { top: "#7eb0e0", mid: "#d5e6f5", fog: "#c5d4e2", sun: "#fff4d2", sunI: 2.35, hemi: "#c5ddf5", ground: "#6a5a48", hemiI: 0.85, exp: 1.02, sx: 30, sy: 48, sz: 12 },
  dusk: { top: "#1b2440", mid: "#e39a62", fog: "#c47a52", sun: "#ffb067", sunI: 1.75, hemi: "#f0a06a", ground: "#2a211c", hemiI: 0.62, exp: 1.06, sx: 48, sy: 16, sz: 18 },
  night: { top: "#070910", mid: "#1c2744", fog: "#101622", sun: "#9bb4ff", sunI: 0.28, hemi: "#243056", ground: "#120e0c", hemiI: 0.38, exp: 1.18, sx: -20, sy: 24, sz: -30 },
};

class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  bus: GainNode | null = null;
  buffers: Partial<Record<"shot" | "boom" | "thud" | "swing", AudioBuffer>> = {};
  muted = false;

  unlock() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.bus = this.ctx.createGain();
      this.bus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.master.gain.value = 0.85;
      this.buffers.shot = this.noise(0.09, 0.55);
      this.buffers.boom = this.noise(0.48, 0.12);
      this.buffers.thud = this.noise(0.14, 0.18);
      this.buffers.swing = this.noise(0.09, 0.7);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private noise(seconds: number, bright: number) {
    const rate = this.ctx!.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = this.ctx!.createBuffer(1, n, rate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = last * (1 - bright) + white * bright;
      data[i] = last * (1 - i / n) ** 1.5;
    }
    return buf;
  }

  play(name: "shot" | "boom" | "thud" | "swing", rate = 1, gain = 0.3) {
    if (!this.ctx || !this.bus || this.muted) return;
    const buffer = this.buffers[name];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.bus);
    src.start();
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
    if (!this.ctx || !this.bus || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start(t);
    o.stop(t + dur);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
      enterCar: () => void;
    };
  }
}

export class YardSim {
  private canvas!: HTMLCanvasElement;
  private onHud: ((h: HudSnapshot) => void) | null = null;
  private touch: TouchState = { moveX: 0, moveY: 0, fire: false, jump: false, use: false };
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private viewCam!: THREE.PerspectiveCamera;
  private world!: CANNON.World;
  private rayFrom = new CANNON.Vec3();
  private rayTo = new CANNON.Vec3();
  private rayResult = new CANNON.RaycastResult();
  private imp = new CANNON.Vec3();
  private rel = new CANNON.Vec3();
  private lookDir = new THREE.Vector3();
  private rightDir = new THREE.Vector3();
  private upDir = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private groundMat!: CANNON.Material;
  private propMat!: CANNON.Material;
  private bouncyMat!: CANNON.Material;
  private boxGeo!: THREE.BoxGeometry;
  private sphereGeo!: THREE.SphereGeometry;
  private cylGeo!: THREE.CylinderGeometry;
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  private statics: StaticBox[] = [];
  private dyns: Dyn[] = [];
  private bots: Bot[] = [];
  private bodyMeta = new Map<CANNON.Body, { dyn?: Dyn; bot?: Bot }>();
  private gun = new THREE.Group();
  private muzzleMesh: THREE.Mesh | null = null;
  private muzzleMat!: THREE.MeshBasicMaterial;
  private sky!: THREE.Mesh;
  private skyCtx!: CanvasRenderingContext2D;
  private skyTex!: THREE.CanvasTexture;
  private fog!: THREE.Fog;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sunMesh!: THREE.Mesh;
  private flash!: THREE.SpotLight;
  private carMesh!: THREE.Group;
  private wheels: THREE.Object3D[] = [];
  private sparkMesh!: THREE.InstancedMesh;
  private sparkLife = new Float32Array(72);
  private sparkPos = new Float32Array(72 * 3);
  private sparkVel = new Float32Array(72 * 3);
  private sparkCursor = 0;
  private sparkDummy = new THREE.Object3D();
  private sparkColor = new THREE.Color();
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private tracerCursor = 0;
  private sfx = new Sfx();
  private keys = new Set<string>();
  private injected = new Set<string>();
  private steerOverride: number | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private dead = false;
  private ro: ResizeObserver | null = null;
  private coarse = false;
  private reduced = false;
  private playing = false;
  private paused = false;
  private mode: Mode = "sandbox";
  private timeName: TimeName = "dusk";
  private hostile = false;
  private slow = false;
  private lampOn = false;
  private weapon = 0;
  private mag: number[] = WEAPON_SLOTS.map((w) => w.mag);
  private reserve: number[] = WEAPON_SLOTS.map((w) => w.reserve);
  private px = 0;
  private py = EYE;
  private pz = 18;
  private yaw = 0;
  private pitch = -0.12;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private grounded = true;
  private wasVy = 0;
  private walk = 0;
  private hp = 100;
  private invuln = 0;
  private sinceHurt = 10;
  private downT = 0;
  private hurt = 0;
  private shake = 0;
  private kick = 0;
  private gunKick = 0;
  private bloom = 0;
  private muzzleT = 0;
  private hitMark = 0;
  private cool = 0;
  private reloading = 0;
  private ads = false;
  private driving = false;
  private wasDriving = false;
  private boosting = false;
  private held: CANNON.Body | null = null;
  private fireHeld = false;
  private firePressed = false;
  private fireLatch = false;
  private altPressed = false;
  private altLatch = false;
  private jumpLatch = false;
  private useLatch = false;
  private lookDx = 0;
  private lookDy = 0;
  private lastLookDx = 0;
  private sway = 0;
  private camX = 0;
  private camY = 8;
  private camZ = 20;
  private orbit = 0.4;
  private time = 0;
  private hitStop = 0;
  private wave = 1;
  private waveLeft = 0;
  private waveDelay = 0;
  private spawnTimer = 0.3;
  private kills = 0;
  private chaos = 0;
  private bestWave = 0;
  private bestChaos = 0;
  private hint = "";
  private hintT = 0;
  private lastEmit = 0;
  private botSeq = 0;
  private wheelSpin = 0;
  private car = { x: 6, z: 11, yaw: 0, speed: 0, hp: 140, deadT: 0 };
  private mouseFire = false;
  private mouseAlt = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Escape") {
      this.togglePause();
      return;
    }
    if (!this.playing || this.paused) return;
    if (e.code === "KeyF") this.tryUse();
    if (e.code === "KeyE" && this.held) this.releaseHeld(true);
    if (e.code === "KeyR") this.startReload();
    if (e.code === "KeyC") this.toggleSlow();
    if (e.code === "KeyN") this.cycleTime();
    if (e.code === "KeyX") this.deleteLook();
    if (e.code === "KeyL") {
      this.lampOn = !this.lampOn;
      this.flash.intensity = this.lampOn ? 18 : 0;
      this.emitNow();
    }
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 6) this.setWeapon(n - 1);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouseFire = false;
    this.mouseAlt = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.coarse || !this.playing || this.paused) return;
    if (document.pointerLockElement !== this.canvas) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.mouseFire = true;
    if (e.button === 2) this.mouseAlt = true;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.button === 0) this.mouseFire = false;
    if (e.button === 2) this.mouseAlt = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.lookDx += e.movementX;
    this.lookDy += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.playing || this.paused) return;
    this.setWeapon(this.weapon + (e.deltaY > 0 ? 1 : -1));
  };

  private onMenu = (e: Event) => e.preventDefault();

  private onVis = () => {
    if (document.visibilityState === "visible") this.sfx.unlock();
  };

  mount(canvas: HTMLCanvasElement, onHud: (h: HudSnapshot) => void, touch: TouchState) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.touch = touch;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loadBest();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor("#100e0c", 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(76, 1, 0.08, 240);
    this.camera.rotation.order = "YXZ";
    this.viewCam = new THREE.PerspectiveCamera(76, 1, 0.05, 10);
    this.viewCam.layers.set(1);
    this.scene.add(this.camera);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sphereGeo = new THREE.SphereGeometry(1, 14, 10);
    this.cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
    this.muzzleMat = new THREE.MeshBasicMaterial({ color: "#ffe6c2" });
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    const solver = this.world.solver as CANNON.GSSolver;
    solver.iterations = 12;
    this.groundMat = new CANNON.Material("ground");
    this.propMat = new CANNON.Material("prop");
    this.bouncyMat = new CANNON.Material("bouncy");
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.propMat, { friction: 0.42, restitution: 0.08 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.bouncyMat, { friction: 0.2, restitution: 0.86 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.propMat, this.propMat, { friction: 0.35, restitution: 0.12 }));
    this.world.defaultContactMaterial.friction = 0.3;
    const ground = new CANNON.Body({ mass: 0, material: this.groundMat });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.buildLights();
    this.buildMap();
    this.buildCar();
    this.dressProps();
    this.dressBots();
    this.initFx();
    this.scene.add(this.gun);
    this.rebuildGun();
    this.applyTime();
    this.bind();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.hookControls();
    this.last = performance.now();
    this.emitNow();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.unbind();
    this.boxGeo?.dispose();
    this.sphereGeo?.dispose();
    this.cylGeo?.dispose();
    this.muzzleMat?.dispose();
    this.skyTex?.dispose();
    this.mats.forEach((m) => m.dispose());
    this.renderer?.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  unlock() {
    this.sfx.unlock();
  }

  addLook(dx: number, dy: number) {
    if (!this.playing || this.paused || this.driving) return;
    this.lookDx += dx;
    this.lookDy += dy;
  }

  begin(mode: Mode) {
    this.mode = mode;
    this.playing = true;
    this.paused = false;
    this.driving = false;
    this.wasDriving = false;
    this.downT = 0;
    this.hp = 100;
    this.kills = 0;
    this.chaos = 0;
    this.wave = 1;
    this.waveLeft = mode === "arena" ? 3 : 0;
    this.waveDelay = mode === "arena" ? 0.6 : 0;
    this.spawnTimer = 0.4;
    this.hostile = mode === "arena";
    this.px = 0;
    this.py = EYE;
    this.pz = 18;
    this.yaw = 0;
    this.pitch = -0.08;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.held = null;
    this.clearBots();
    this.clearDynamics();
    this.dressProps();
    if (mode === "sandbox") this.dressBots();
    this.mag = WEAPON_SLOTS.map((w) => w.mag);
    this.reserve = WEAPON_SLOTS.map((w) => (mode === "sandbox" && (w.kind === "gun" || w.kind === "nade") ? 999 : w.reserve));
    this.car.x = 6;
    this.car.z = 11;
    this.car.yaw = 0;
    this.car.speed = 0;
    this.car.hp = 140;
    this.car.deadT = 0;
    this.hint = mode === "arena" ? "Волна 1" : "Ломай всё";
    this.hintT = 2.4;
    this.unlock();
    this.requestLock();
    this.emitNow();
  }

  enterCar() {
    if (!this.playing) this.begin("sandbox");
    if (this.car.deadT > 0) {
      this.car.deadT = 0;
      this.car.hp = 140;
    }
    this.driving = true;
    this.wasDriving = false;
    this.downT = 0;
    this.paused = false;
  }

  togglePause() {
    if (!this.playing) return;
    this.paused = !this.paused;
    if (!this.paused) this.requestLock();
    this.saveBest();
    this.emitNow();
  }

  setWeapon(i: number) {
    const n = WEAPON_SLOTS.length;
    this.weapon = ((i % n) + n) % n;
    this.reloading = 0;
    this.rebuildGun();
    this.emitNow();
  }

  spawnKind(kind: SpawnKind) {
    if (!this.playing || this.paused) return;
    const yaw = this.driving ? this.car.yaw : this.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const x = (this.driving ? this.car.x : this.px) + fx * 3.4;
    const z = (this.driving ? this.car.z : this.pz) + fz * 3.4;
    if (kind === "bot") {
      this.spawnBot(x, z, this.mode === "arena" ? true : this.hostile);
      this.emitNow();
      return;
    }
    const specs: Record<Exclude<SpawnKind, "bot">, DynOpts> = {
      barrel: { kind: "barrel", x, y: 2.2, z, w: 0.72, h: 1, d: 0.72, mass: 8, color: "#3d4550", hp: 50, cyl: true },
      explosive: { kind: "explosive", x, y: 2.3, z, w: 0.74, h: 1.05, d: 0.74, mass: 9, color: "#9e1b2d", emissive: "#d7263d", hp: 22, cyl: true },
      crate: { kind: "crate", x, y: 2, z, w: 0.8, h: 0.8, d: 0.8, mass: 6, color: "#8a5a32", hp: 40 },
      ball: { kind: "ball", x, y: 2.2, z, w: 1.15, h: 1, d: 1, mass: 3.5, color: "#e25b1a", hp: 80, sphere: true, bouncy: true },
      block: { kind: "block", x, y: 2.2, z, w: 1.1, h: 0.7, d: 0.7, mass: 16, color: "#6e675f", hp: 110 },
    };
    this.makeDyn(specs[kind]);
    this.trim();
    this.emitNow();
  }

  toggleHostile() {
    if (this.mode === "arena") return;
    this.hostile = !this.hostile;
    for (const b of this.bots) b.hostile = this.hostile;
    this.hint = this.hostile ? "Боты злые" : "Боты спокойные";
    this.hintT = 1.2;
    this.emitNow();
  }

  cycleTime() {
    const order: TimeName[] = ["day", "dusk", "night"];
    this.timeName = order[(order.indexOf(this.timeName) + 1) % 3]!;
    this.lampOn = this.timeName === "night";
    this.applyTime();
    this.hint = this.timeName === "day" ? "День" : this.timeName === "dusk" ? "Закат" : "Ночь";
    this.hintT = 1.1;
    this.emitNow();
  }

  applyWish(wish: { time: TimeName; slow: boolean; hostile: boolean; muted: boolean; weapon: number; kinds: SpawnKind[] }) {
    this.timeName = wish.time;
    this.lampOn = wish.time === "night";
    this.applyTime();
    this.slow = wish.slow;
    if (this.mode !== "arena") {
      this.hostile = wish.hostile;
      for (const b of this.bots) b.hostile = wish.hostile;
    }
    this.sfx.muted = wish.muted;
    this.setWeapon(wish.weapon);
    wish.kinds.forEach((kind) => this.spawnKind(kind));
    this.hint = wish.kinds.length ? "Набор на дворе" : this.hint;
    this.hintT = 1.4;
    this.emitNow();
  }

  toggleSlow() {
    this.slow = !this.slow;
    this.hint = this.slow ? "Слоу-мо" : "Обычное время";
    this.hintT = 1;
    this.emitNow();
  }

  toggleMute() {
    this.sfx.muted = !this.sfx.muted;
    try {
      localStorage.setItem("svalka.mute", this.sfx.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    this.emitNow();
  }

  clearMess() {
    if (!this.playing) return;
    this.clearBots();
    this.clearDynamics();
    this.held = null;
    this.dressProps();
    if (this.mode === "sandbox") this.dressBots();
    this.hint = "Двор чист";
    this.hintT = 1.1;
    this.emitNow();
  }

  private hookControls() {
    window.__controlsTest = {
      getYaw: () => (this.driving ? this.car.yaw : this.yaw),
      getSpeed: () => (this.driving ? this.car.speed : Math.hypot(this.vx, this.vz)),
      setKeys: (codes) => {
        this.injected = new Set(codes);
      },
      setSteer: (v) => {
        this.steerOverride = v;
      },
      enterCar: () => this.enterCar(),
    };
  }

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onMenu);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("visibilitychange", this.onVis);
  }

  private unbind() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas?.removeEventListener("wheel", this.onWheel);
    this.canvas?.removeEventListener("contextmenu", this.onMenu);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("visibilitychange", this.onVis);
  }

  private requestLock() {
    if (this.coarse || !this.playing || !this.canvas) return;
    try {
      const p = this.canvas.requestPointerLock();
      void Promise.resolve(p).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  private down(code: string) {
    return this.keys.has(code) || this.injected.has(code);
  }

  private frame = (now: number) => {
    if (this.dead) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    this.applyLook();
    if (this.hitStop > 0 && this.playing && !this.paused) {
      this.hitStop -= dt;
    } else if (!this.paused) {
      const scale = this.playing && this.slow ? 0.35 : 1;
      this.acc += dt * scale;
      const h = 1 / 60;
      let n = 0;
      while (this.acc >= h && n < 4) {
        this.integrate(h);
        this.world.step(h);
        this.acc -= h;
        n++;
      }
    }
    this.syncMeshes();
    this.updateFx(dt);
    this.updateCamera(dt);
    this.render();
    if (now - this.lastEmit > 90) {
      this.lastEmit = now;
      this.emitNow();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private applyLook() {
    if (!this.playing || this.paused || this.driving) {
      this.lookDx = 0;
      this.lookDy = 0;
      return;
    }
    const sens = 0.00215 * (this.ads ? 0.62 : 1);
    this.yaw -= this.lookDx * sens;
    this.pitch -= this.lookDy * sens;
    this.pitch = clamp(this.pitch, -1.35, 1.35);
    this.sway += (clamp(-this.lookDx * 0.003, -0.12, 0.12) - this.sway) * 0.2;
    this.lookDx = 0;
    this.lookDy = 0;
  }

  private integrate(dt: number) {
    this.time += dt;
    this.fireHeld = this.mouseFire || this.touch.fire;
    this.firePressed = this.fireHeld && !this.fireLatch;
    this.fireLatch = this.fireHeld;
    const alt = this.mouseAlt;
    this.altPressed = alt && !this.altLatch;
    this.altLatch = alt;
    const w = WEAPON_SLOTS[this.weapon]!;
    this.ads = this.playing && !this.driving && w.kind === "gun" && alt;
    if (this.playing && this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0) this.respawn();
    }
    if (this.playing && this.downT <= 0) {
      if (this.driving) this.updateCar(dt);
      else this.updatePlayer(dt);
      this.handleCombat(dt);
      if (this.sinceHurt > (this.mode === "sandbox" ? 0.2 : 3.4)) {
        this.hp = Math.min(100, this.hp + (this.mode === "sandbox" ? 22 : 6) * dt);
      }
    }
    this.updateBots(dt);
    this.updateNades(dt);
    this.updateWaves(dt);
    this.decayCar(dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hintT > 0) this.hintT -= dt;
    this.sinceHurt += dt;
    for (const d of this.dyns.slice()) {
      if (d.body.position.y < -8) this.removeDyn(d);
    }
  }

  private updatePlayer(dt: number) {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    let ix = 0;
    let iz = 0;
    if (Math.hypot(this.touch.moveX, this.touch.moveY) > 0.18) {
      ix = this.touch.moveX;
      iz = this.touch.moveY;
    } else {
      if (this.down("KeyD")) ix += 1;
      if (this.down("KeyA")) ix -= 1;
      if (this.down("KeyW")) iz += 1;
      if (this.down("KeyS")) iz -= 1;
    }
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const sprint = this.down("ShiftLeft") || this.down("ShiftRight");
    const sp = sprint ? 8.6 : 4.8;
    const wx = rightX * ix + forwardX * iz;
    const wz = rightZ * ix + forwardZ * iz;
    const accel = this.grounded ? 16 : 3.5;
    const blend = 1 - Math.exp(-accel * dt);
    this.vx += (wx * sp - this.vx) * blend;
    this.vz += (wz * sp - this.vz) * blend;
    const jumpDown = this.down("Space") || this.touch.jump;
    if (jumpDown && !this.jumpLatch && this.grounded) this.vy = 7.6;
    this.jumpLatch = jumpDown;
    this.vy -= 24 * dt;
    const feet = this.py - EYE;
    const head = this.py + 0.18;
    const ox = this.px;
    const oz = this.pz;
    const nx = this.px + this.vx * dt;
    const nz = this.pz + this.vz * dt;
    let sep = this.separate(nx, nz, PR, feet, head, true, false);
    const blocked = Math.hypot(sep.x - nx, sep.z - nz) > 0.004;
    if (blocked && this.grounded) {
      const up = this.separate(nx, nz, PR, feet + 0.46, head + 0.46, false, false);
      if (Math.hypot(up.x - ox, up.z - oz) > Math.hypot(sep.x - ox, sep.z - oz) + 0.02) {
        sep = up;
        this.py += 0.46;
      }
    }
    if (sep.hitStatic) {
      if (Math.abs(sep.x - ox) < Math.abs(this.vx * dt) * 0.45) this.vx *= 0.15;
      if (Math.abs(sep.z - oz) < Math.abs(this.vz * dt) * 0.45) this.vz *= 0.15;
    }
    this.px = clamp(sep.x, -34, 34);
    this.pz = clamp(sep.z, -34, 34);
    this.py += this.vy * dt;
    const g = this.groundAt(this.px, this.py, this.pz, this.vy, dt);
    this.py = g.y;
    this.vy = g.vy;
    this.grounded = g.grounded;
    if (this.wasVy < -9 && this.grounded) {
      this.sfx.play("thud", 1.3, 0.18);
      this.shake = Math.min(1, this.shake + 0.18);
    }
    this.wasVy = this.vy;
    this.walk += Math.hypot(this.vx, this.vz) * dt;
  }

  private updateCar(dt: number) {
    if (this.car.deadT > 0) return;
    let steer = 0;
    if (this.steerOverride !== null) steer = clamp(this.steerOverride, -1, 1);
    else if (Math.abs(this.touch.moveX) > 0.18) steer = -this.touch.moveX;
    else {
      if (this.down("KeyA") || this.down("ArrowLeft")) steer += 1;
      if (this.down("KeyD") || this.down("ArrowRight")) steer -= 1;
    }
    let throttle = 0;
    if (this.down("KeyW") || this.down("ArrowUp")) throttle += 1;
    if (this.down("KeyS") || this.down("ArrowDown")) throttle -= 1;
    if (Math.abs(this.touch.moveY) > 0.18) throttle = this.touch.moveY;
    this.boosting = this.down("ShiftLeft") || this.down("ShiftRight") || this.touch.fire;
    if (this.boosting) throttle += 0.7;
    throttle = clamp(throttle, -1, 1.45);
    const drag = Math.abs(throttle) < 0.05 ? 1.7 : 0.2;
    this.car.speed -= this.car.speed * drag * dt;
    this.car.speed += throttle * 20 * dt;
    this.car.speed = clamp(this.car.speed, -8, this.boosting ? 27 : 17);
    const reverse = this.car.speed >= 0 ? 1 : -1;
    const speedFactor = Math.min(1, Math.abs(this.car.speed) / 7);
    this.car.yaw += steer * 2.3 * Math.max(0.45, speedFactor) * reverse * dt;
    const fx = -Math.sin(this.car.yaw);
    const fz = -Math.cos(this.car.yaw);
    const nx = this.car.x + fx * this.car.speed * dt;
    const nz = this.car.z + fz * this.car.speed * dt;
    const hit = this.separate(nx, nz, 1.15, 0.05, 1.45, true, true);
    if (hit.hitStatic) this.car.speed *= -0.16;
    else if (hit.hitDyn) this.car.speed *= 0.84;
    this.car.x = clamp(hit.x, -33, 33);
    this.car.z = clamp(hit.z, -33, 33);
    this.wheelSpin += this.car.speed * dt * 1.4;
    if (this.boosting && Math.abs(this.car.speed) > 3) {
      this.burst(this.car.x - fx * 1.5, 0.35, this.car.z - fz * 1.5, "#e25b1a", 1, 3);
    }
  }

  private separate(x: number, z: number, r: number, feet: number, head: number, affectDyn: boolean, ignoreCar: boolean) {
    let hitStatic = false;
    let hitDyn = false;
    const solve = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, body: CANNON.Body | null) => {
      if (head < minY || feet > maxY) return;
      const cx = clamp(x, minX, maxX);
      const cz = clamp(z, minZ, maxZ);
      let dx = x - cx;
      let dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      let nx = 0;
      let nz = 0;
      let pen = 0;
      if (d2 < 1e-8) {
        const left = x - minX;
        const right = maxX - x;
        const back = z - minZ;
        const front = maxZ - z;
        const m = Math.min(left, right, back, front);
        if (m === left) {
          nx = -1;
          pen = left + r;
        } else if (m === right) {
          nx = 1;
          pen = right + r;
        } else if (m === back) {
          nz = -1;
          pen = back + r;
        } else {
          nz = 1;
          pen = front + r;
        }
      } else {
        const d = Math.sqrt(d2);
        pen = r - d;
        nx = dx / d;
        nz = dz / d;
      }
      x += nx * pen;
      z += nz * pen;
      if (body && affectDyn) {
        hitDyn = true;
        body.wakeUp();
        body.velocity.x += nx * (3.2 + pen * 6);
        body.velocity.z += nz * (3.2 + pen * 6);
        body.velocity.y += 0.35;
      } else if (!body) hitStatic = true;
    };
    for (const s of this.statics) solve(s.minX, s.maxX, s.minY, s.maxY, s.minZ, s.maxZ, null);
    for (const d of this.dyns) {
      if (d.removed || d.body === this.held || d.body.mass <= 0) continue;
      d.body.updateAABB();
      const lo = d.body.aabb.lowerBound;
      const hi = d.body.aabb.upperBound;
      solve(lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, d.body);
    }
    if (!ignoreCar && this.car.deadT <= 0) {
      solve(this.car.x - 1.2, this.car.x + 1.2, 0, 1.25, this.car.z - 1.35, this.car.z + 1.35, null);
    }
    return { x, z, hitStatic, hitDyn };
  }

  private groundAt(x: number, y: number, z: number, vy: number, dt: number) {
    const prevFeet = y - EYE - vy * dt;
    const feet = y - EYE;
    let best = -Infinity;
    let landed = false;
    const consider = (minX: number, maxX: number, maxY: number, minZ: number, maxZ: number) => {
      if (x + PR < minX || x - PR > maxX || z + PR < minZ || z - PR > maxZ) return;
      if (vy <= 0 && prevFeet >= maxY - 0.1 && feet <= maxY + 0.25 && maxY > best) {
        best = maxY;
        landed = true;
      }
    };
    for (const s of this.statics) consider(s.minX, s.maxX, s.maxY, s.minZ, s.maxZ);
    for (const d of this.dyns) {
      if (d.removed || d.body === this.held) continue;
      d.body.updateAABB();
      const lo = d.body.aabb.lowerBound;
      const hi = d.body.aabb.upperBound;
      consider(lo.x, hi.x, hi.y, lo.z, hi.z);
    }
    if (!this.driving && this.car.deadT <= 0) consider(this.car.x - 1.2, this.car.x + 1.2, 1.2, this.car.z - 1.3, this.car.z + 1.3);
    if (landed) return { y: best + EYE, vy: 0, grounded: true };
    if (vy <= 0 && prevFeet >= -0.05 && feet <= 0.25) return { y: EYE, vy: 0, grounded: true };
    return { y, vy, grounded: false };
  }

  private handleCombat(dt: number) {
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.finishReload();
      }
    }
    this.cool = Math.max(0, this.cool - dt);
    const w = WEAPON_SLOTS[this.weapon]!;
    if (this.altPressed && w.kind === "claw") this.pinLook();
    if (w.kind === "claw") this.updateClaw();
    else if (this.held) this.releaseHeld(false);
    if (w.kind === "gun" && (w.auto ? this.fireHeld : this.firePressed)) this.shootGun();
    if (w.kind === "melee" && this.firePressed) this.melee();
    if (w.kind === "nade" && this.firePressed) this.throwNade();
    const use = this.touch.use;
    if (use && !this.useLatch) this.tryUse();
    this.useLatch = use;
  }

  private shootGun() {
    const w = WEAPON_SLOTS[this.weapon]!;
    if (w.kind !== "gun" || this.reloading > 0 || this.cool > 0) return;
    if (this.mag[this.weapon]! <= 0) {
      this.startReload();
      this.sfx.tone(140, 0.04, 0.05, "square");
      return;
    }
    this.cool = w.cooldown;
    this.mag[this.weapon] = (this.mag[this.weapon] ?? 0) - 1;
    this.kick += w.recoil;
    this.gunKick = 0.08;
    this.shake = Math.min(1, this.shake + w.shake);
    this.bloom = Math.min(1, this.bloom + (w.pellets > 1 ? 0.4 : 0.16));
    this.muzzleT = 0.05;
    this.sfx.play("shot", 0.75 + Math.random() * 0.5, w.pellets > 1 ? 0.42 : 0.26);
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.lookDir);
    this.rightDir.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.upDir.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const fx = this.lookDir.x;
    const fy = this.lookDir.y;
    const fz = this.lookDir.z;
    const rxx = this.rightDir.x;
    const rxy = this.rightDir.y;
    const rxz = this.rightDir.z;
    const uxx = this.upDir.x;
    const uxy = this.upDir.y;
    const uxz = this.upDir.z;
    const ox = this.camera.position.x;
    const oy = this.camera.position.y;
    const oz = this.camera.position.z;
    const spread = w.spread + this.bloom * 0.05;
    for (let p = 0; p < w.pellets; p++) {
      const jx = (Math.random() - 0.5) * 2 * spread;
      const jy = (Math.random() - 0.5) * 2 * spread;
      let dx = fx + rxx * jx + uxx * jy;
      let dy = fy + rxy * jx + uxy * jy;
      let dz = fz + rxz * jx + uxz * jy;
      const mag = Math.hypot(dx, dy, dz) || 1;
      dx /= mag;
      dy /= mag;
      dz /= mag;
      this.fireRay(ox, oy, oz, dx, dy, dz, w.range, w.dmg, w.force);
    }
    if ((this.mag[this.weapon] ?? 0) <= 0) this.startReload();
  }

  private fireRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, dmg: number, force: number) {
    const hit = this.ray(ox, oy, oz, ox + dx * range, oy + dy * range, oz + dz * range);
    const ex = hit ? hit.x : ox + dx * range;
    const ey = hit ? hit.y : oy + dy * range;
    const ez = hit ? hit.z : oz + dz * range;
    this.tracer(ox, oy, oz, ex, ey, ez);
    this.aim.set(dx, dy, dz);
    if (!hit?.body) {
      this.burst(ex, ey, ez, "#f3eadf", 3, 2);
      return;
    }
    const meta = this.bodyMeta.get(hit.body);
    if (meta?.bot) this.hurtBot(meta.bot, dmg, dx, dy, dz, force);
    else if (meta?.dyn) this.damageDyn(meta.dyn, dmg, this.aim, force, hit.x, hit.y, hit.z, false);
    this.burst(hit.x, hit.y, hit.z, meta?.bot ? "#d7263d" : "#ffb067", 7, 4.5);
    if (meta?.bot || meta?.dyn) this.hitMark = 1;
  }

  private melee() {
    if (this.cool > 0 || this.driving) return;
    this.cool = 0.42;
    this.gunKick = 0.06;
    this.shake = Math.min(1, this.shake + 0.12);
    this.sfx.play("swing", 0.9 + Math.random() * 0.3, 0.22);
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.lookDir);
    const ox = this.camera.position.x;
    const oy = this.camera.position.y;
    const oz = this.camera.position.z;
    for (const b of this.bots.slice()) {
      const dx = b.x - ox;
      const dy = 1.15 - oy;
      const dz = b.z - oz;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 2.35 && dx * this.lookDir.x + dy * this.lookDir.y + dz * this.lookDir.z > 0.35) {
        this.hurtBot(b, 48, dx / (dist || 1), 0.35, dz / (dist || 1), 9);
        this.hitMark = 1;
      }
    }
    let best: Dyn | null = null;
    let bestD = 2.4;
    for (const d of this.dyns) {
      if (d.removed || d.body === this.held) continue;
      const dx = d.body.position.x - ox;
      const dy = d.body.position.y - oy;
      const dz = d.body.position.z - oz;
      const dist = Math.hypot(dx, dy, dz);
      const dot = dx * this.lookDir.x + dy * this.lookDir.y + dz * this.lookDir.z;
      if (dist < bestD && dot > 0.3) {
        best = d;
        bestD = dist;
      }
    }
    if (best) {
      this.aim.set(this.lookDir.x, this.lookDir.y + 0.3, this.lookDir.z);
      this.damageDyn(best, 44, this.aim, 11, best.body.position.x, best.body.position.y, best.body.position.z, false);
      this.hitMark = 1;
      this.sfx.play("thud", 0.7, 0.28);
    }
  }

  private throwNade() {
    if (this.cool > 0 || this.driving) return;
    const i = this.weapon;
    const stock = (this.mag[i] ?? 0) + (this.mode === "sandbox" ? 1 : (this.reserve[i] ?? 0));
    if (this.mode === "arena" && stock <= 0) {
      this.sfx.tone(130, 0.04, 0.05, "square");
      return;
    }
    this.cool = 0.65;
    if (this.mode === "arena") {
      if ((this.mag[i] ?? 0) > 0) this.mag[i] = (this.mag[i] ?? 0) - 1;
      else this.reserve[i] = (this.reserve[i] ?? 0) - 1;
    }
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.lookDir);
    const o = this.camera.position;
    const dyn = this.makeDyn({
      kind: "nade",
      x: o.x + this.lookDir.x * 0.7,
      y: o.y + this.lookDir.y * 0.7 - 0.15,
      z: o.z + this.lookDir.z * 0.7,
      w: 0.28,
      h: 0.28,
      d: 0.28,
      mass: 1.1,
      color: "#3d4550",
      hp: 10,
      sphere: true,
      fuse: 1.65,
    });
    dyn.body.velocity.set(this.lookDir.x * 13 + this.vx, this.lookDir.y * 13 + 2.4, this.lookDir.z * 13 + this.vz);
    this.gunKick = 0.05;
  }

  private updateClaw() {
    if (this.held) {
      if (!this.fireHeld) this.releaseHeld(false);
      else this.pullHeld();
      return;
    }
    if (this.firePressed) this.tryGrab();
  }

  private tryGrab() {
    const hit = this.lookHit(6.5);
    const dyn = hit?.body ? this.bodyMeta.get(hit.body)?.dyn : undefined;
    if (!dyn || dyn.removed || dyn.body.mass <= 0) return;
    this.held = dyn.body;
    this.held.collisionFilterGroup = 2;
    this.held.wakeUp();
    this.sfx.tone(240, 0.05, 0.05, "square");
  }

  private pullHeld() {
    const b = this.held;
    if (!b) return;
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.lookDir);
    const tx = this.camera.position.x + this.lookDir.x * 2.8;
    const ty = this.camera.position.y + this.lookDir.y * 2.8;
    const tz = this.camera.position.z + this.lookDir.z * 2.8;
    b.wakeUp();
    b.velocity.x = (tx - b.position.x) * 12;
    b.velocity.y = (ty - b.position.y) * 12;
    b.velocity.z = (tz - b.position.z) * 12;
    b.angularVelocity.scale(0.86, b.angularVelocity);
  }

  private releaseHeld(throwIt: boolean) {
    const b = this.held;
    if (!b) return;
    b.collisionFilterGroup = 1;
    if (throwIt) {
      this.camera.updateMatrixWorld();
      this.camera.getWorldDirection(this.lookDir);
      b.velocity.x = this.lookDir.x * 18 + this.vx;
      b.velocity.y = this.lookDir.y * 18 + 1.5;
      b.velocity.z = this.lookDir.z * 18 + this.vz;
      this.sfx.play("swing", 1.4, 0.16);
    }
    b.wakeUp();
    this.held = null;
  }

  private pinLook() {
    const hit = this.lookHit(6);
    const dyn = hit?.body ? this.bodyMeta.get(hit.body)?.dyn : undefined;
    if (!dyn || dyn.removed || dyn.kind === "nade") return;
    if (dyn.body.mass > 0) {
      dyn.pinnedMass = dyn.body.mass;
      dyn.body.mass = 0;
      dyn.body.type = CANNON.Body.STATIC;
      dyn.body.updateMassProperties();
      dyn.body.velocity.set(0, 0, 0);
      dyn.body.angularVelocity.set(0, 0, 0);
      this.hint = "Заморожено";
    } else {
      dyn.body.mass = dyn.pinnedMass || 5;
      dyn.body.type = CANNON.Body.DYNAMIC;
      dyn.body.updateMassProperties();
      dyn.body.wakeUp();
      this.hint = "Отпущено";
    }
    this.hintT = 0.9;
  }

  private deleteLook() {
    const hit = this.lookHit(7);
    const dyn = hit?.body ? this.bodyMeta.get(hit.body)?.dyn : undefined;
    if (!dyn) return;
    this.removeDyn(dyn);
    this.hint = "Удалено";
    this.hintT = 0.7;
  }

  private lookHit(range: number) {
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.lookDir);
    const o = this.camera.position;
    return this.ray(o.x, o.y, o.z, o.x + this.lookDir.x * range, o.y + this.lookDir.y * range, o.z + this.lookDir.z * range);
  }

  private tryUse() {
    if (!this.playing || this.paused || this.downT > 0) return;
    if (this.held) {
      this.releaseHeld(true);
      return;
    }
    if (this.driving || this.nearCar()) {
      this.toggleCar();
      return;
    }
    this.melee();
  }

  private nearCar() {
    if (this.car.deadT > 0) return false;
    return Math.hypot(this.px - this.car.x, this.pz - this.car.z) < 3.5;
  }

  private toggleCar() {
    if (this.driving) {
      this.driving = false;
      const rx = Math.cos(this.car.yaw);
      const rz = -Math.sin(this.car.yaw);
      this.px = this.car.x + rx * 2.2;
      this.pz = this.car.z + rz * 2.2;
      this.py = EYE;
      this.vx = 0;
      this.vz = 0;
      this.vy = 0;
      this.hint = "Пешком";
    } else if (this.car.deadT <= 0) {
      this.driving = true;
      this.wasDriving = false;
      if (this.held) this.releaseHeld(false);
      this.hint = "За рулём";
    }
    this.hintT = 1;
    this.emitNow();
  }

  private startReload() {
    const w = WEAPON_SLOTS[this.weapon]!;
    if (w.kind !== "gun" || this.reloading > 0) return;
    if ((this.mag[this.weapon] ?? 0) >= w.mag) return;
    if (this.mode === "arena" && (this.reserve[this.weapon] ?? 0) <= 0) {
      this.sfx.tone(120, 0.04, 0.04, "square");
      return;
    }
    this.reloading = w.reload;
  }

  private finishReload() {
    const w = WEAPON_SLOTS[this.weapon]!;
    if (w.kind !== "gun") return;
    if (this.mode === "sandbox") {
      this.mag[this.weapon] = w.mag;
      return;
    }
    const need = w.mag - (this.mag[this.weapon] ?? 0);
    const take = Math.min(need, this.reserve[this.weapon] ?? 0);
    this.mag[this.weapon] = (this.mag[this.weapon] ?? 0) + take;
    this.reserve[this.weapon] = (this.reserve[this.weapon] ?? 0) - take;
  }

  private ray(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    this.rayFrom.set(x1, y1, z1);
    this.rayTo.set(x2, y2, z2);
    this.rayResult.reset();
    const ok = this.world.raycastClosest(this.rayFrom, this.rayTo, { skipBackfaces: false, collisionFilterMask: 1 }, this.rayResult);
    if (!ok || !this.rayResult.hasHit || !this.rayResult.body) return null;
    const p = this.rayResult.hitPointWorld;
    return { x: p.x, y: p.y, z: p.z, distance: this.rayResult.distance, body: this.rayResult.body };
  }

  private los(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    const hit = this.ray(x1, y1, z1, x2, y2, z2);
    if (!hit) return true;
    return hit.distance > Math.hypot(x2 - x1, y2 - y1, z2 - z1) - 0.8;
  }

  private impulse(body: CANNON.Body, dx: number, dy: number, dz: number, force: number, hx: number, hy: number, hz: number) {
    if (body.type !== CANNON.Body.DYNAMIC || body.mass <= 0) return;
    body.wakeUp();
    this.imp.set(dx * force, dy * force, dz * force);
    this.rel.set(hx - body.position.x, hy - body.position.y, hz - body.position.z);
    body.applyImpulse(this.imp, this.rel);
  }

  private damageDyn(d: Dyn, amount: number, dir: THREE.Vector3, force: number, hx: number, hy: number, hz: number, fromBlast: boolean) {
    if (d.removed || d.dead) return;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;
    if (!fromBlast && force > 0) this.impulse(d.body, dx, dy, dz, force, hx, hy, hz);
    d.hp -= amount;
    this.chaos += 1;
    if (d.hp > 0) {
      if (d.kind === "limb" && amount > 30) this.detach(d);
      return;
    }
    const x = d.body.position.x;
    const y = d.body.position.y;
    const z = d.body.position.z;
    if (d.kind === "explosive" || d.kind === "nade") {
      this.removeDyn(d);
      this.explode(x, y, z, d.kind === "nade" ? 16 : 24);
      return;
    }
    if (d.kind === "limb") {
      d.hp = 240;
      this.detach(d);
      return;
    }
    if (d.kind === "crate" || d.kind === "barrel") {
      this.removeDyn(d);
      this.shatter(x, y, z, dx, dy, dz);
      return;
    }
    this.removeDyn(d);
  }

  private shatter(x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    this.burst(x, y, z, "#f3eadf", 10, 4);
    this.sfx.play("thud", 0.6, 0.25);
    for (let i = 0; i < 3; i++) {
      const chip = this.makeDyn({
        kind: "chip",
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + 0.2,
        z: z + (Math.random() - 0.5) * 0.4,
        w: 0.28,
        h: 0.22,
        d: 0.26,
        mass: 0.6,
        color: "#8a5a32",
        hp: 12,
      });
      chip.body.velocity.set(dx * 4 + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, dz * 4 + (Math.random() - 0.5) * 3);
    }
    this.chaos += 8;
    this.trim();
  }

  private explode(x: number, y: number, z: number, power: number) {
    this.sfx.play("boom", 0.75 + Math.random() * 0.35, 0.62);
    this.sfx.tone(48, 0.28, 0.16, "sine");
    this.shake = Math.min(1, this.shake + 0.8);
    this.hitStop = 0.05;
    this.chaos += 18;
    this.burst(x, y, z, "#e25b1a", 22, 10);
    this.burst(x, y + 0.4, z, "#f3eadf", 8, 6);
    const radius = 7.6;
    for (const d of this.dyns.slice()) {
      if (d.removed) continue;
      const dx = d.body.position.x - x;
      const dy = d.body.position.y - y;
      const dz = d.body.position.z - z;
      const dist = Math.hypot(dx, dy, dz) || 0.001;
      if (dist > radius) continue;
      const fall = 1 - dist / radius;
      this.aim.set(dx / dist, dy / dist + 0.35, dz / dist);
      this.impulse(d.body, this.aim.x, this.aim.y, this.aim.z, power * fall, d.body.position.x, d.body.position.y, d.body.position.z);
      this.damageDyn(d, 18 + power * fall * 0.7, this.aim, 0, d.body.position.x, d.body.position.y, d.body.position.z, true);
    }
    for (const b of this.bots.slice()) {
      const dist = Math.hypot(b.x - x, 1.1 - y, b.z - z);
      if (dist > radius) continue;
      const fall = 1 - dist / radius;
      this.hurtBot(b, 28 + fall * 55, (b.x - x) / (dist || 1), 0.45, (b.z - z) / (dist || 1), 7 + fall * 6);
    }
    if (this.playing && this.downT <= 0) {
      const px = this.driving ? this.car.x : this.px;
      const pz = this.driving ? this.car.z : this.pz;
      const dist = Math.hypot(px - x, pz - z);
      if (dist < radius) this.hurtPlayer((1 - dist / radius) * 58);
    }
    if (this.car.deadT <= 0) {
      const dist = Math.hypot(this.car.x - x, this.car.z - z);
      if (dist < radius) {
        const fall = 1 - dist / radius;
        this.car.speed += ((this.car.x - x) / (dist || 1)) * power * fall * 0.35;
        this.hurtCar(fall * 48);
      }
    }
    this.saveBest();
  }

  private hurtPlayer(amount: number) {
    this.hurt = 1;
    this.sinceHurt = 0;
    this.shake = Math.min(1, this.shake + 0.4);
    if (this.mode === "sandbox") {
      this.hp = Math.max(30, this.hp - amount * 0.22);
      return;
    }
    if (this.invuln > 0 || this.downT > 0) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downT = 1.7;
      this.driving = false;
      this.hint = "Тебя размазало";
      this.hintT = 1.4;
      this.sfx.play("thud", 0.55, 0.4);
    }
  }

  private hurtCar(amount: number) {
    if (this.car.deadT > 0 || this.car.hp <= 0) return;
    this.car.hp -= amount;
    if (this.car.hp > 0) return;
    this.car.hp = 0;
    const x = this.car.x;
    const z = this.car.z;
    this.driving = false;
    this.car.deadT = 3.4;
    this.car.speed = 0;
    this.hint = "Тачка вспыхнула";
    this.hintT = 1.4;
    this.explode(x, 0.7, z, 18);
  }

  private decayCar(dt: number) {
    if (this.car.deadT <= 0) return;
    this.car.deadT -= dt;
    if (this.car.deadT > 0) return;
    this.car.deadT = 0;
    this.car.hp = 140;
    this.car.x = 6;
    this.car.z = 11;
    this.car.yaw = 0;
    this.car.speed = 0;
  }

  private respawn() {
    this.px = 0;
    this.py = EYE;
    this.pz = 18;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.hp = 100;
    this.invuln = 1.6;
    this.sinceHurt = 0;
    this.driving = false;
    this.hint = "Снова в деле";
    this.hintT = 1.3;
  }

  private updateBots(dt: number) {
    const tx = this.driving ? this.car.x : this.px;
    const tz = this.driving ? this.car.z : this.pz;
    const ty = this.driving ? 1.1 : this.py * 0.5 + 0.8;
    for (const bot of this.bots) {
      bot.cool -= dt;
      const dx = tx - bot.x;
      const dz = tz - bot.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      let throttle = 0.75;
      if (bot.hostile && this.playing && dist < 32) {
        const desired = Math.atan2(-dx, -dz);
        const diff = Math.atan2(Math.sin(desired - bot.yaw), Math.cos(desired - bot.yaw));
        bot.yaw += clamp(diff, -2.6 * dt, 2.6 * dt);
        if (dist < 7) throttle = -0.35;
        else if (dist < 12) throttle = 0.2;
        const sees = this.los(bot.x, 1.45, bot.z, tx, ty, tz);
        if (sees && this.downT <= 0 && dist < 26 && dist > 3 && bot.cool <= 0) {
          bot.cool = 0.95;
          this.botShoot(bot, tx, ty, tz);
        }
      } else {
        bot.wander -= dt;
        if (bot.wander <= 0) {
          bot.wander = 1.4 + Math.random() * 2.2;
          bot.yaw += (Math.random() - 0.5) * 2.2;
        }
      }
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const ox = bot.x;
      const oz = bot.z;
      bot.x += fx * 3.3 * throttle * dt;
      bot.z += fz * 3.3 * throttle * dt;
      const sep = this.separate(bot.x, bot.z, 0.42, 0, 1.7, false, false);
      if (Math.hypot(sep.x - bot.x, sep.z - bot.z) > 0.02) bot.yaw += 2.2 * dt;
      bot.x = clamp(sep.x, -33, 33);
      bot.z = clamp(sep.z, -33, 33);
      for (const o of this.bots) {
        if (o === bot) continue;
        const ddx = bot.x - o.x;
        const ddz = bot.z - o.z;
        const d = Math.hypot(ddx, ddz);
        if (d < 1.05 && d > 0.001) {
          bot.x += (ddx / d) * (1.05 - d);
          bot.z += (ddz / d) * (1.05 - d);
        }
      }
      bot.body.position.set(bot.x, 1.05, bot.z);
      bot.mesh.position.set(bot.x, 0, bot.z);
      bot.mesh.rotation.y = bot.yaw;
      const moved = Math.hypot(bot.x - ox, bot.z - oz);
      const swing = Math.sin(this.time * 9 + bot.id) * (moved > 0.001 ? 0.7 : 0);
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      if (bot.flash > 0) {
        bot.flash -= dt;
        bot.mat.emissiveIntensity = bot.flash > 0 ? 0.9 : 0;
      }
    }
  }

  private botShoot(bot: Bot, tx: number, ty: number, tz: number) {
    const ox = bot.x;
    const oy = 1.45;
    const oz = bot.z;
    let dx = tx - ox + (Math.random() - 0.5) * 0.8;
    let dy = ty - oy + (Math.random() - 0.5) * 0.45;
    let dz = tz - oz + (Math.random() - 0.5) * 0.8;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const hit = this.ray(ox, oy, oz, ox + dx * 40, oy + dy * 40, oz + dz * 40);
    this.tracer(ox, oy, oz, hit ? hit.x : ox + dx * 24, hit ? hit.y : oy + dy * 24, hit ? hit.z : oz + dz * 24);
    this.sfx.play("shot", 1.35, 0.1);
    if (hit?.body) {
      const meta = this.bodyMeta.get(hit.body);
      if (meta?.dyn) this.damageDyn(meta.dyn, 10, this.aim.set(dx, dy, dz), 2, hit.x, hit.y, hit.z, false);
      if (meta?.bot && meta.bot !== bot) this.hurtBot(meta.bot, 12, dx, dy, dz, 2);
    }
    const px = this.driving ? this.car.x : this.px;
    const py = this.driving ? 1.1 : this.py;
    const pz = this.driving ? this.car.z : this.pz;
    const vx = px - ox;
    const vy = py - oy;
    const vz = pz - oz;
    const t = clamp(vx * dx + vy * dy + vz * dz, 0, 40);
    const miss = Math.hypot(px - (ox + dx * t), py - (oy + dy * t), pz - (oz + dz * t));
    if (miss < 0.72 && (!hit || hit.distance > t - 0.5)) this.hurtPlayer(8);
  }

  private updateWaves(dt: number) {
    if (!this.playing || this.mode !== "arena" || this.downT > 0) return;
    if (this.waveDelay > 0) {
      this.waveDelay -= dt;
      return;
    }
    if (this.waveLeft > 0 && this.bots.length < 4) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.65;
        const edge = Math.floor(Math.random() * 4);
        const a = (Math.random() - 0.5) * 20;
        const x = edge === 2 ? -28 : edge === 3 ? 28 : a;
        const z = edge === 0 ? -28 : edge === 1 ? 28 : a;
        this.spawnBot(x, z, true);
        this.waveLeft--;
      }
    } else if (this.waveLeft <= 0 && this.bots.length === 0) {
      this.wave++;
      this.waveLeft = Math.min(10, 2 + this.wave);
      this.waveDelay = 2.3;
      this.hint = `Волна ${this.wave}`;
      this.hintT = 1.8;
      this.saveBest();
    }
  }

  private updateNades(dt: number) {
    const due: Dyn[] = [];
    for (const d of this.dyns) {
      if (d.kind !== "nade" || d.removed) continue;
      d.fuse -= dt;
      if (d.fuse <= 0) due.push(d);
    }
    for (const d of due) {
      if (d.removed) continue;
      const x = d.body.position.x;
      const y = d.body.position.y;
      const z = d.body.position.z;
      this.removeDyn(d);
      this.explode(x, y, z, 16);
    }
  }

  private hurtBot(bot: Bot, dmg: number, dx: number, dy: number, dz: number, force: number) {
    if (bot.hp <= 0) return;
    bot.hp -= dmg;
    bot.flash = 0.09;
    bot.mat.emissive.set("#ffffff");
    this.chaos += 2;
    this.hitMark = 1;
    if (bot.hp > 0) return;
    const x = bot.x;
    const z = bot.z;
    this.removeBot(bot);
    this.ragdoll(x, z, dx, dz, 3.5 + force);
    this.kills++;
    this.chaos += 22;
    this.hitStop = 0.045;
    this.hint = "Рэгдолл";
    this.hintT = 0.8;
    if (this.mode === "arena") {
      this.reserve[0] = Math.min(120, (this.reserve[0] ?? 0) + 8);
      this.reserve[1] = Math.min(48, (this.reserve[1] ?? 0) + 2);
      this.reserve[2] = Math.min(180, (this.reserve[2] ?? 0) + 12);
    }
    this.sfx.play("thud", 0.5, 0.3);
  }

  private ragdoll(x: number, z: number, dx: number, dz: number, power: number) {
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const specs = [
      { id: "pelvis", px: 0, py: 0.92, w: 0.34, h: 0.22, d: 0.2, m: 5, color: "#c4551a" },
      { id: "chest", px: 0, py: 1.28, w: 0.4, h: 0.34, d: 0.22, m: 6, color: "#b4532a" },
      { id: "head", px: 0, py: 1.68, w: 0.26, h: 0.26, d: 0.26, m: 1.8, color: "#e7e1d6", sphere: true },
      { id: "armL", px: -0.36, py: 1.26, w: 0.12, h: 0.4, d: 0.12, m: 1.1, color: "#a84822" },
      { id: "armR", px: 0.36, py: 1.26, w: 0.12, h: 0.4, d: 0.12, m: 1.1, color: "#a84822" },
      { id: "legL", px: -0.1, py: 0.46, w: 0.13, h: 0.5, d: 0.13, m: 2, color: "#3d342c" },
      { id: "legR", px: 0.1, py: 0.46, w: 0.13, h: 0.5, d: 0.13, m: 2, color: "#3d342c" },
    ];
    const made = new Map<string, Dyn>();
    for (const s of specs) {
      const dyn = this.makeDyn({
        kind: "limb",
        x: x + s.px,
        y: s.py,
        z,
        w: s.w,
        h: s.h,
        d: s.d,
        mass: s.m,
        color: s.color,
        hp: 40,
        sphere: s.sphere,
      });
      dyn.body.velocity.set(ux * power, 1.4 + Math.random(), uz * power);
      dyn.body.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      made.set(s.id, dyn);
    }
    const link = (a?: Dyn, b?: Dyn) => {
      if (!a || !b) return;
      const mx = (a.body.position.x + b.body.position.x) / 2;
      const my = (a.body.position.y + b.body.position.y) / 2;
      const mz = (a.body.position.z + b.body.position.z) / 2;
      const c = new CANNON.PointToPointConstraint(
        a.body,
        new CANNON.Vec3(mx - a.body.position.x, my - a.body.position.y, mz - a.body.position.z),
        b.body,
        new CANNON.Vec3(mx - b.body.position.x, my - b.body.position.y, mz - b.body.position.z),
      );
      this.world.addConstraint(c);
      a.links.push(c);
      b.links.push(c);
    };
    link(made.get("pelvis"), made.get("chest"));
    link(made.get("chest"), made.get("head"));
    link(made.get("chest"), made.get("armL"));
    link(made.get("chest"), made.get("armR"));
    link(made.get("pelvis"), made.get("legL"));
    link(made.get("pelvis"), made.get("legR"));
    this.trim();
  }

  private detach(d: Dyn) {
    for (const c of d.links.splice(0)) {
      this.world.removeConstraint(c);
      for (const o of this.dyns) {
        const k = o.links.indexOf(c);
        if (k >= 0) o.links.splice(k, 1);
      }
    }
  }

  private updateFx(dt: number) {
    this.hitMark = Math.max(0, this.hitMark - dt * 6);
    this.hurt = Math.max(0, this.hurt - dt * 1.5);
    this.shake *= Math.exp(-3.4 * dt);
    this.kick *= Math.exp(-8 * dt);
    this.gunKick *= Math.exp(-10 * dt);
    this.bloom = Math.max(0, this.bloom - dt * 1.4);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    if (this.muzzleMesh) this.muzzleMesh.visible = this.muzzleT > 0;
    for (let i = 0; i < this.sparkLife.length; i++) {
      if (this.sparkLife[i]! <= 0) continue;
      this.sparkLife[i]! -= dt;
      this.sparkVel[i * 3 + 1]! -= 14 * dt;
      this.sparkPos[i * 3]! += this.sparkVel[i * 3]! * dt;
      this.sparkPos[i * 3 + 1]! += this.sparkVel[i * 3 + 1]! * dt;
      this.sparkPos[i * 3 + 2]! += this.sparkVel[i * 3 + 2]! * dt;
      const s = Math.max(0, this.sparkLife[i]!);
      this.sparkDummy.position.set(this.sparkPos[i * 3]!, this.sparkPos[i * 3 + 1]!, this.sparkPos[i * 3 + 2]!);
      this.sparkDummy.scale.setScalar(s * 1.6);
      this.sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.sparkDummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.visible = t.life > 0;
    }
  }

  private burst(x: number, y: number, z: number, hex: string, n: number, speed: number) {
    this.sparkColor.set(hex);
    for (let k = 0; k < n; k++) {
      const i = this.sparkCursor % this.sparkLife.length;
      this.sparkCursor++;
      this.sparkLife[i] = 0.28 + Math.random() * 0.35;
      this.sparkPos[i * 3] = x;
      this.sparkPos[i * 3 + 1] = y;
      this.sparkPos[i * 3 + 2] = z;
      this.sparkVel[i * 3] = (Math.random() - 0.5) * speed;
      this.sparkVel[i * 3 + 1] = Math.random() * speed * 0.8;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.sparkMesh.setColorAt(i, this.sparkColor);
    }
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  private tracer(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    const t = this.tracers[this.tracerCursor % this.tracers.length];
    if (!t) return;
    this.tracerCursor++;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    t.life = 0.07;
    t.mesh.visible = true;
    t.mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    t.mesh.scale.set(0.03, 0.03, len);
    t.mesh.lookAt(x2, y2, z2);
  }

  private syncMeshes() {
    for (const d of this.dyns) {
      d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
    }
    this.carMesh.visible = this.car.deadT <= 0;
    if (this.car.deadT <= 0) {
      this.carMesh.position.set(this.car.x, 0, this.car.z);
      this.carMesh.rotation.set(0, this.car.yaw, 0);
      for (const w of this.wheels) {
        w.rotation.order = "YXZ";
        w.rotation.y = this.wheelSpin;
      }
    }
  }

  private updateCamera(dt: number) {
    if (!this.playing) {
      this.orbit += dt * (this.reduced ? 0.04 : 0.18);
      this.camera.position.set(Math.sin(this.orbit) * 20, 7.6, Math.cos(this.orbit) * 20);
      this.camera.lookAt(0, 1.1, 2);
      this.gun.visible = false;
      this.sky.position.copy(this.camera.position);
      return;
    }
    this.gun.visible = !this.driving && this.downT <= 0;
    if (this.driving && this.car.deadT <= 0) {
      const fx = -Math.sin(this.car.yaw);
      const fz = -Math.cos(this.car.yaw);
      const destX = this.car.x - fx * 6.8;
      const destY = 3.05;
      const destZ = this.car.z - fz * 6.8;
      if (!this.wasDriving) {
        this.camX = destX;
        this.camY = destY;
        this.camZ = destZ;
      }
      const k = 1 - Math.exp(-5 * dt);
      this.camX += (destX - this.camX) * k;
      this.camY += (destY - this.camY) * k;
      this.camZ += (destZ - this.camZ) * k;
      this.camera.position.set(this.camX, this.camY, this.camZ);
      this.camera.lookAt(this.car.x + fx * 3, 0.85, this.car.z + fz * 3);
      this.wasDriving = true;
    } else {
      this.wasDriving = false;
      const bob = Math.sin(this.walk * 2.1) * Math.min(0.045, Math.hypot(this.vx, this.vz) * 0.006);
      const s = this.shake;
      this.camera.position.set(this.px + (Math.random() - 0.5) * s * 0.14, this.py + bob + (Math.random() - 0.5) * s * 0.08, this.pz + (Math.random() - 0.5) * s * 0.14);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(this.pitch + this.kick, this.yaw, 0);
    }
    const fov = this.ads ? 52 : this.boosting && this.driving ? 86 : 76;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, 12 * dt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.placeGun();
    this.sky.position.copy(this.camera.position);
    this.flash.intensity = this.lampOn ? 18 : 0;
  }

  private placeGun() {
    if (!this.gun.visible) return;
    const ads = this.ads ? 1 : 0;
    this.gun.position.copy(this.camera.position);
    this.gun.quaternion.copy(this.camera.quaternion);
    this.gun.translateX(0.22 * (1 - ads) + this.sway);
    this.gun.translateY(-0.2 + ads * 0.05 + Math.sin(this.walk * 2.1) * 0.01);
    this.gun.translateZ(-0.48 + this.gunKick);
  }

  private render() {
    if (!this.renderer || this.canvas.clientWidth < 2) return;
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (!this.gun.visible) return;
    this.viewCam.position.copy(this.camera.position);
    this.viewCam.quaternion.copy(this.camera.quaternion);
    this.viewCam.fov = this.camera.fov;
    this.viewCam.updateProjectionMatrix();
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.viewCam);
    this.renderer.autoClear = true;
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCam.aspect = w / h;
    this.viewCam.updateProjectionMatrix();
  }

  private buildLights() {
    this.hemi = new THREE.HemisphereLight("#f0a06a", "#2a211c", 0.62);
    this.hemi.layers.enable(1);
    this.scene.add(this.hemi);
    const amb = new THREE.AmbientLight("#f3eadf", 0.18);
    amb.layers.enable(1);
    this.scene.add(amb);
    this.sun = new THREE.DirectionalLight("#ffb067", 1.75);
    this.sun.position.set(48, 16, 18);
    this.sun.layers.enable(1);
    this.scene.add(this.sun);
    this.flash = new THREE.SpotLight("#ffe6c4", 0, 22, 0.62, 0.45, 1.2);
    this.flash.position.set(0.15, -0.05, 0);
    this.flash.target.position.set(0, 0, -1);
    this.camera.add(this.flash);
    this.camera.add(this.flash.target);
    this.sunMesh = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: "#ffb067" }));
    this.sunMesh.scale.setScalar(5);
    this.scene.add(this.sunMesh);
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    this.skyCtx = canvas.getContext("2d")!;
    this.skyTex = new THREE.CanvasTexture(canvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.skyTex.magFilter = THREE.LinearFilter;
    const skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 20, 14), skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.fog = new THREE.Fog("#c47a52", 22, 92);
    this.scene.fog = this.fog;
  }

  private applyTime() {
    const t = TIMES[this.timeName];
    const g = this.skyCtx;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, t.top);
    grd.addColorStop(0.55, t.mid);
    grd.addColorStop(1, t.fog);
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    this.skyTex.needsUpdate = true;
    this.fog.color.set(t.fog);
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunI;
    this.sun.position.set(t.sx, t.sy, t.sz);
    this.hemi.color.set(t.hemi);
    this.hemi.groundColor.set(t.ground);
    this.hemi.intensity = t.hemiI;
    this.renderer.toneMappingExposure = t.exp;
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.set(t.sun);
    const len = Math.hypot(t.sx, t.sy, t.sz) || 1;
    this.sunMesh.position.set((t.sx / len) * 90, (t.sy / len) * 70, (t.sz / len) * 90);
    this.flash.intensity = this.lampOn ? 18 : 0;
  }

  private buildMap() {
    const tex = this.groundTex();
    const gmat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), gmat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.addStatic(0, 2.2, -38, 80, 4.4, 1.2, "#3a342e");
    this.addStatic(0, 2.2, 38, 80, 4.4, 1.2, "#3a342e");
    this.addStatic(-38, 2.2, 0, 1.2, 4.4, 80, "#3a342e");
    this.addStatic(38, 2.2, 0, 1.2, 4.4, 80, "#3a342e");
    this.addStatic(-14, 1.35, -8, 6.6, 2.7, 2.5, "#b4532a");
    this.addStripe(-14, 1.7, -6.66, 6.2, 0.28, 0.08);
    this.addStatic(12, 1.35, -16, 2.5, 2.7, 7.2, "#3d4550");
    this.addStripe(13.16, 1.55, -16, 0.08, 0.36, 6.6);
    this.addStatic(-22, 1.25, 8, 2.4, 2.5, 6.4, "#6e675f");
    this.addStatic(20, 2.45, -6, 5.2, 0.28, 5.2, "#5c564e");
    for (let i = 0; i < 7; i++) {
      const h = 0.36 * (i + 1);
      this.addStatic(13.4 + i * 0.78, h / 2, -6, 0.78, h, 2.3, i % 2 ? "#5c564e" : "#6a6158");
    }
    this.addStatic(-3.2, 0.55, 9.5, 2.4, 1.1, 0.45, "#6e675f");
    this.addStatic(7.5, 0.45, 16, 1.6, 0.9, 0.4, "#6e675f");
    this.addStatic(-16, 0.4, 16, 2.2, 0.8, 0.5, "#5c564e");
    this.addPole(-8, 10);
    this.addPole(14, 8);
    this.addPole(-6, -12);
    const hills: [number, number, number][] = [
      [-48, -28, 16],
      [46, -20, 14],
      [-40, 30, 12],
      [36, 34, 18],
    ];
    for (const [x, z, s] of hills) {
      const hill = new THREE.Mesh(this.sphereGeo, this.mat("#241c18"));
      hill.scale.set(s, s * 0.38, s);
      hill.position.set(x, -1.5, z);
      this.scene.add(hill);
    }
    this.makeSign();
  }

  private groundTex() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1a1816";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "#2c2824";
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    g.strokeStyle = "#e25b1a";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(256, 256, 78, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  private makeSign() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1c1814";
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = "#e25b1a";
    g.fillRect(0, 0, 512, 12);
    g.fillRect(0, 116, 512, 12);
    g.fillStyle = "#f3eadf";
    g.font = "700 76px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("СВАЛКА", 256, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(0, 3.4, -22);
    this.scene.add(mesh);
  }

  private addPole(x: number, z: number) {
    this.addStatic(x, 2.2, z, 0.16, 4.4, 0.16, "#2a2420");
    const lamp = new THREE.Mesh(this.boxGeo, this.mat("#f3eadf", "#e25b1a"));
    lamp.scale.set(0.55, 0.12, 0.28);
    lamp.position.set(x, 4.35, z);
    this.scene.add(lamp);
  }

  private addStripe(x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new THREE.Mesh(this.boxGeo, this.mat("#f3eadf"));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
  }

  private addStatic(x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    const mesh = new THREE.Mesh(this.boxGeo, this.mat(color));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const body = new CANNON.Body({ mass: 0, material: this.groundMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, y, z);
    this.world.addBody(body);
    this.statics.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  private mat(color: string, emissive = "") {
    const key = `${color}|${emissive}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, emissive: emissive || "#000000", emissiveIntensity: emissive ? 0.55 : 0 });
      this.mats.set(key, m);
    }
    return m;
  }

  private buildCar() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.boxGeo, this.mat("#8a3a22"));
    body.scale.set(1.55, 0.42, 2.7);
    body.position.y = 0.55;
    const cab = new THREE.Mesh(this.boxGeo, this.mat("#241c18"));
    cab.scale.set(1.25, 0.38, 1.15);
    cab.position.set(0, 0.92, -0.15);
    g.add(body, cab);
    const positions: [number, number, number][] = [
      [0.72, 0.28, 0.85],
      [-0.72, 0.28, 0.85],
      [0.72, 0.28, -0.9],
      [-0.72, 0.28, -0.9],
    ];
    for (const [x, y, z] of positions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const w = new THREE.Mesh(this.cylGeo, this.mat("#141210"));
      w.scale.set(0.32, 0.18, 0.32);
      w.rotation.z = Math.PI / 2;
      pivot.add(w);
      g.add(pivot);
      this.wheels.push(pivot);
    }
    this.carMesh = g;
    this.scene.add(g);
  }

  private dressProps() {
    const crates: [number, number, number][] = [
      [-6, 0.4, 5],
      [-5.1, 0.4, 6.2],
      [-5.6, 1.2, 5.5],
      [2.2, 0.4, -2.5],
      [9, 0.4, 5],
    ];
    for (const [x, y, z] of crates) this.makeDyn({ kind: "crate", x, y, z, w: 0.8, h: 0.8, d: 0.8, mass: 6, color: "#8a5a32", hp: 40 });
    this.makeDyn({ kind: "crate", x: 0.4, y: 6.5, z: 1.2, w: 0.9, h: 0.9, d: 0.9, mass: 8, color: "#a36b3c", hp: 40 });
    const barrels: [number, number, number][] = [
      [-8, 0.55, 2],
      [4.2, 0.55, 1.5],
      [-12, 0.55, 12],
    ];
    for (const [x, y, z] of barrels) this.makeDyn({ kind: "barrel", x, y, z, w: 0.72, h: 1.05, d: 0.72, mass: 8, color: "#3d4550", hp: 55, cyl: true });
    const bombs: [number, number, number][] = [
      [-1.4, 0.55, 4.4],
      [0.6, 0.55, 5.2],
      [1.8, 0.55, 3.6],
    ];
    for (const [x, y, z] of bombs) {
      this.makeDyn({ kind: "explosive", x, y, z, w: 0.74, h: 1.05, d: 0.74, mass: 9, color: "#9e1b2d", emissive: "#d7263d", hp: 22, cyl: true });
    }
    this.makeDyn({ kind: "ball", x: 11, y: 1.2, z: 7, w: 1.2, h: 1, d: 1, mass: 3.2, color: "#e25b1a", hp: 90, sphere: true, bouncy: true });
    this.makeDyn({ kind: "block", x: -15, y: 0.45, z: 14, w: 1.3, h: 0.8, d: 0.7, mass: 20, color: "#6e675f", hp: 130 });
  }

  private dressBots() {
    this.spawnBot(-4, 7, false);
    this.spawnBot(3.5, 1.5, false);
    this.spawnBot(-9, -4, false);
  }

  private makeDyn(o: DynOpts) {
    let mesh: THREE.Mesh;
    let shape: CANNON.Shape;
    if (o.sphere) {
      const r = o.w * 0.5;
      mesh = new THREE.Mesh(this.sphereGeo, this.mat(o.color, o.emissive ?? ""));
      mesh.scale.setScalar(r);
      shape = new CANNON.Sphere(r);
    } else if (o.cyl) {
      const r = o.w * 0.5;
      mesh = new THREE.Mesh(this.cylGeo, this.mat(o.color, o.emissive ?? ""));
      mesh.scale.set(r, o.h, r);
      shape = new CANNON.Cylinder(r, r, o.h, 10);
    } else {
      mesh = new THREE.Mesh(this.boxGeo, this.mat(o.color, o.emissive ?? ""));
      mesh.scale.set(o.w, o.h, o.d);
      shape = new CANNON.Box(new CANNON.Vec3(o.w / 2, o.h / 2, o.d / 2));
    }
    mesh.position.set(o.x, o.y, o.z);
    this.scene.add(mesh);
    const body = new CANNON.Body({ mass: o.mass, material: o.bouncy ? this.bouncyMat : this.propMat, shape });
    body.position.set(o.x, o.y, o.z);
    body.linearDamping = o.kind === "limb" ? 0.15 : 0.06;
    body.angularDamping = o.kind === "limb" ? 0.4 : 0.08;
    body.allowSleep = o.kind !== "nade";
    this.world.addBody(body);
    const dyn: Dyn = {
      body,
      mesh,
      kind: o.kind,
      hp: o.hp,
      dead: false,
      removed: false,
      links: [],
      fuse: o.fuse ?? 0,
      pinnedMass: o.mass,
    };
    this.dyns.push(dyn);
    this.bodyMeta.set(body, { dyn });
    return dyn;
  }

  private spawnBot(x: number, z: number, hostile: boolean) {
    if (this.bots.length >= 6) return;
    const visual = this.makeBotVisual(hostile);
    visual.g.position.set(x, 0, z);
    this.scene.add(visual.g);
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.26, 0.55, 0.18)));
    body.position.set(x, 1.05, z);
    body.collisionFilterGroup = 1;
    this.world.addBody(body);
    const bot: Bot = {
      id: ++this.botSeq,
      x,
      z,
      yaw: Math.random() * Math.PI * 2,
      hp: 100,
      mesh: visual.g,
      mat: visual.mat,
      headMat: visual.headMat,
      legL: visual.legL,
      legR: visual.legR,
      body,
      cool: 0.5,
      wander: 1,
      flash: 0,
      hostile,
    };
    this.bodyMeta.set(body, { bot });
    this.bots.push(bot);
  }

  private makeBotVisual(hostile: boolean) {
    const mat = new THREE.MeshLambertMaterial({ color: hostile ? "#9e2a2b" : "#c4551a", emissive: "#000000" });
    const headMat = new THREE.MeshLambertMaterial({ color: "#e7e1d6" });
    const g = new THREE.Group();
    const torso = new THREE.Mesh(this.boxGeo, mat);
    torso.scale.set(0.42, 0.55, 0.24);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(this.sphereGeo, headMat);
    head.scale.setScalar(0.16);
    head.position.set(0, 1.62, 0);
    const visor = new THREE.Mesh(this.boxGeo, this.mat(hostile ? "#d7263d" : "#1a120e"));
    visor.scale.set(0.14, 0.05, 0.05);
    visor.position.set(0, 1.62, -0.14);
    const legL = new THREE.Mesh(this.boxGeo, mat);
    legL.scale.set(0.12, 0.48, 0.12);
    legL.position.set(-0.1, 0.42, 0);
    const legR = new THREE.Mesh(this.boxGeo, mat);
    legR.scale.set(0.12, 0.48, 0.12);
    legR.position.set(0.1, 0.42, 0);
    const armL = new THREE.Mesh(this.boxGeo, mat);
    armL.scale.set(0.1, 0.42, 0.1);
    armL.position.set(-0.3, 1.18, 0);
    const armR = new THREE.Mesh(this.boxGeo, mat);
    armR.scale.set(0.1, 0.42, 0.1);
    armR.position.set(0.3, 1.18, 0);
    g.add(torso, head, visor, legL, legR, armL, armR);
    return { g, mat, headMat, legL, legR };
  }

  private removeBot(bot: Bot) {
    this.world.removeBody(bot.body);
    this.bodyMeta.delete(bot.body);
    this.scene.remove(bot.mesh);
    bot.mat.dispose();
    bot.headMat.dispose();
    const i = this.bots.indexOf(bot);
    if (i >= 0) this.bots.splice(i, 1);
  }

  private clearBots() {
    while (this.bots.length) this.removeBot(this.bots[0]!);
  }

  private removeDyn(d: Dyn) {
    if (d.removed) return;
    d.removed = true;
    d.dead = true;
    if (this.held === d.body) {
      this.held.collisionFilterGroup = 1;
      this.held = null;
    }
    for (const c of d.links) {
      this.world.removeConstraint(c);
      for (const o of this.dyns) {
        const k = o.links.indexOf(c);
        if (k >= 0) o.links.splice(k, 1);
      }
    }
    d.links.length = 0;
    this.world.removeBody(d.body);
    this.scene.remove(d.mesh);
    this.bodyMeta.delete(d.body);
    const i = this.dyns.indexOf(d);
    if (i >= 0) this.dyns.splice(i, 1);
  }

  private clearDynamics() {
    while (this.dyns.length) this.removeDyn(this.dyns[0]!);
  }

  private trim() {
    if (this.dyns.length <= 54) return;
    const junk = this.dyns.find((d) => d.kind === "chip" || d.kind === "limb");
    if (junk) this.removeDyn(junk);
  }

  private rebuildGun() {
    this.gun.clear();
    const kind = WEAPON_SLOTS[this.weapon]!.kind;
    const steel = this.mat("#8a7568");
    const dark = this.mat("#1c1814");
    const rust = this.mat("#e25b1a");
    const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number, material: THREE.Material) => {
      const m = new THREE.Mesh(this.boxGeo, material);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      this.gun.add(m);
    };
    let tip = -0.45;
    if (kind === "gun") {
      const len = this.weapon === 1 ? 0.78 : this.weapon === 2 ? 0.9 : 0.46;
      add(0.07, 0.08, len, 0, 0, -len * 0.35, steel);
      add(0.05, 0.14, 0.16, 0, -0.1, 0.02, dark);
      if (this.weapon === 1) add(0.09, 0.07, len * 0.62, 0.05, 0.03, -0.28, steel);
      if (this.weapon === 2) add(0.04, 0.16, 0.2, 0, 0.02, 0.16, dark);
      tip = -len * 0.35 - len * 0.5;
    } else if (kind === "claw") {
      add(0.06, 0.06, 0.34, 0, 0, -0.16, rust);
      add(0.03, 0.16, 0.03, 0, 0.08, -0.36, steel);
      add(0.16, 0.03, 0.03, 0, -0.04, -0.36, steel);
      tip = -0.4;
    } else if (kind === "nade") {
      const s = new THREE.Mesh(this.sphereGeo, this.mat("#3d4550"));
      s.scale.setScalar(0.09);
      s.position.set(0, -0.02, -0.18);
      this.gun.add(s);
      tip = -0.28;
    } else {
      add(0.045, 0.045, 0.62, 0, 0, -0.28, dark);
      add(0.1, 0.025, 0.16, 0, 0.02, -0.6, steel);
      tip = -0.7;
    }
    this.muzzleMesh = new THREE.Mesh(this.sphereGeo, this.muzzleMat);
    this.muzzleMesh.scale.setScalar(0.07);
    this.muzzleMesh.position.set(0, 0.02, tip);
    this.muzzleMesh.visible = false;
    this.gun.add(this.muzzleMesh);
    this.gun.traverse((o: THREE.Object3D) => o.layers.set(1));
    this.gun.frustumCulled = false;
  }

  private initFx() {
    const geo = new THREE.SphereGeometry(0.06, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    this.sparkMesh = new THREE.InstancedMesh(geo, mat, this.sparkLife.length);
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.count = this.sparkLife.length;
    for (let i = 0; i < this.sparkLife.length; i++) {
      this.sparkDummy.position.set(0, -30, 0);
      this.sparkDummy.scale.setScalar(0);
      this.sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.sparkDummy.matrix);
      this.sparkMesh.setColorAt(i, this.sparkColor.set("#ffffff"));
    }
    this.scene.add(this.sparkMesh);
    const tmat = new THREE.MeshBasicMaterial({ color: "#ffb067" });
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(this.boxGeo, tmat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
  }

  private loadBest() {
    try {
      this.bestWave = Number(localStorage.getItem("svalka.wave") || 0);
      this.bestChaos = Number(localStorage.getItem("svalka.chaos") || 0);
      this.sfx.muted = localStorage.getItem("svalka.mute") === "1";
    } catch {
      /* ignore */
    }
  }

  private saveBest() {
    try {
      if (this.wave > this.bestWave) {
        this.bestWave = this.wave;
        localStorage.setItem("svalka.wave", String(this.wave));
      }
      if (this.chaos > this.bestChaos) {
        this.bestChaos = Math.floor(this.chaos);
        localStorage.setItem("svalka.chaos", String(this.bestChaos));
      }
    } catch {
      /* ignore */
    }
  }

  private emitNow() {
    this.onHud?.(this.snapshot());
  }

  private snapshot(): HudSnapshot {
    const w = WEAPON_SLOTS[this.weapon]!;
    return {
      playing: this.playing,
      paused: this.paused,
      mode: this.mode,
      hp: Math.round(this.hp),
      mag: this.mag[this.weapon] ?? 0,
      reserve: this.reserve[this.weapon] ?? 0,
      weapon: this.weapon,
      weaponName: w.name,
      showAmmo: w.kind === "gun" || w.kind === "nade",
      wave: this.wave,
      kills: this.kills,
      chaos: Math.floor(this.chaos),
      hint: this.hintT > 0 ? this.hint : "",
      hit: this.hitMark > 0.15,
      hurt: this.hurt,
      driving: this.driving,
      time: this.timeName,
      hostile: this.hostile,
      slow: this.slow,
      grabbed: this.held !== null,
      down: this.downT > 0,
      spread: w.spread + this.bloom * 0.08,
      bestWave: this.bestWave,
      bestChaos: this.bestChaos,
      muted: this.sfx.muted,
      lamp: this.lampOn,
      carHp: Math.max(0, Math.round(this.car.hp)),
    };
  }
}
