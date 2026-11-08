(async () => {
  //#region 1: BootstrapAndDOMInjection
  const { PIXI, GUI, UPlotClass, canvas, minimapCard, minimapCanvas } = await (async () => {
    document.title = 'Hierarchical Flow Field Pathfinding';

    if (typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator) {
      await new Promise(resolve => {
        const coiScript = document.createElement('script');
        coiScript.src = './coi-serviceworker.min.js';
        coiScript.onload = () => {
          if (window.crossOriginIsolated || navigator.serviceWorker.controller) {
            resolve();
          } else {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
            setTimeout(resolve, 600);
          }
        };
        coiScript.onerror = () => resolve();
        document.head.appendChild(coiScript);
      });
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = 'https://cdn.jsdelivr.net/npm/uplot@1.6.31/dist/uPlot.min.css';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #040711; height: 100dvh; overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  user-select: none; -webkit-user-select: none;
}
canvas#canvas { display: block; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.lil-gui {
  --background-color: rgba(4, 8, 18, 0.94);
  --text-color: #cbd5e1;
  --title-background-color: rgba(15, 23, 42, 0.95);
  --widget-color: rgba(30, 41, 59, 0.85);
  --hover-color: rgba(56, 189, 248, 0.25);
  --focus-color: rgba(56, 189, 248, 0.45);
  --number-color: #38bdf8;
  --string-color: #4ade80;
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
}
.lil-gui .title {
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #f8fafc;
}
.lil-gui .lil-children {
  scrollbar-width: thin;
  scrollbar-color: rgba(56, 189, 248, 0.3) transparent;
}
.lil-gui .lil-children::-webkit-scrollbar {
  width: 5px;
}
.lil-gui .lil-children::-webkit-scrollbar-thumb {
  background: rgba(56, 189, 248, 0.3);
  border-radius: 3px;
}
.uplot {
  font-family: inherit !important;
  user-select: none;
}
.uplot .u-wrap {
  position: relative !important;
}
.uplot canvas {
  display: block;
}
#minimap-card {
  position: absolute; bottom: 12px; right: 12px; pointer-events: auto;
  background: rgba(4, 8, 18, 0.94); border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 8px; padding: 6px; backdrop-filter: blur(12px);
  box-shadow: 0 12px 32px rgba(0,0,0,0.8); z-index: 10;
  display: flex; flex-direction: column; gap: 4px;
}
#minimap-header { display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
#minimap-canvas { display: block; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.2); cursor: crosshair; }
#hints {
  position: absolute; bottom: 12px; left: 12px; pointer-events: none;
  color: #94a3b8; font-size: 10.5px; background: rgba(4, 8, 18, 0.88);
  padding: 6px 12px; border-radius: 6px; backdrop-filter: blur(8px);
  border: 1px solid rgba(56, 189, 248, 0.2); max-width: 680px; z-index: 9;
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
}
#hints span b {
  color: #38bdf8;
}
`;
    document.head.appendChild(style);

    const minimapCard = document.createElement('div');
    minimapCard.id = 'minimap-card';

    const minimapCanvas = document.createElement('canvas');
    minimapCanvas.id = 'minimap-canvas';
    minimapCanvas.width = 160;
    minimapCanvas.height = 96;
    minimapCard.appendChild(minimapCanvas);

    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';

    document.body.append(minimapCard, canvas);

    const [PIXI, guiMod, uplotMod] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist/pixi.min.mjs'),
      import('https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.min.js'),
      import('https://cdn.jsdelivr.net/npm/uplot@1.6.31/dist/uPlot.esm.js')
    ]);

    const GUI = guiMod.default || guiMod;
    const uPlot = uplotMod.default || uplotMod;
    const UPlotClass = uPlot?.default || uPlot;

    return { PIXI, GUI, UPlotClass, canvas, minimapCard, minimapCanvas };
  })();
  //#endregion

  //#region 2: ConfigurationStore
  const CONFIG = (() => ({
    world: {
      seed: 1337666,
      chunksX: 10,
      chunksY: 6,
      preset: 'The Grand Citadel',
      wallDensity: 1.0,
      mudDensity: 1.0
    },
    simulation: {
      paused: false,
      simSpeed: 3.0,
      agentCount: 10_000,
      spawnPattern: 'Left Flank',
      agentRadius: 0.25,
      maxSpeed: 25.0,
      steeringGain: 15.0,
      separationStrength: 60.0,
      pathBudgetMs: 40.0,
      parallelWorkers: true,
      workerCount: typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? Math.min(Math.max(1, navigator.hardwareConcurrency - 1), 8)
        : 4
    },
    autoGoal: {
      enabled: true,
      mode: 'On Arrival', // 'Either' | 'On Arrival' | 'Timer'
      arrivalPct: 0.95,
      delay: 0.5,
      interval: 1.0
    },
    audio: {
      enabled: true
    },
    telemetry: {
      fps: 60,
      simMs: 0.0,
      sabMode: 'Initializing',
      activeWorkers: 0,
      activeChunks: 0,
      agentCount: 10000,
      movingCount: 0,
      arrivedCount: 0,
      flowCacheCount: 0,
      autoGoalTimer: 'Active',
      selectedId: 0,
      selectedState: 'Moving',
      selectedSpeed: 0.0,
      selectedGoalDist: 0.0,
      selectedCorridor: '--'
    }
  }))();
  //#endregion

  //#region 3: SoundSynthesizer
  const { SoundEngine, audio } = (() => {
    class SoundEngine {
      constructor() {
        this.ctx = null;
      }
      init() {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      }
      playGoal() {
        if (!CONFIG.audio.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(now); osc.stop(now + 0.28);
      }
      playArrival() {
        if (!CONFIG.audio.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(now); osc.stop(now + 0.3);
      }
      playClick() {
        if (!CONFIG.audio.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(now); osc.stop(now + 0.04);
      }
    }
    const audio = new SoundEngine();
    return { SoundEngine, audio };
  })();
  //#endregion

  //#region 4: ConstantsAndMathUtilities
  const {
    CS, CC, SQ2, OCT, MAX_AGENTS, FIXED_DT,
    COST_HIGHWAY, COST_OPEN, COST_MUD, COST_BLOCK,
    DX, DY, DL, clamp, octile, mulberry32, createOffscreen
  } = (() => {
    const CS = 16;                 // Chunk size (16 x 16 cells)
    const CC = CS * CS;            // 256 cells per chunk
    const SQ2 = Math.SQRT2;
    const OCT = SQ2 - 1;
    const MAX_AGENTS = 20_000;
    const FIXED_DT = 1 / 60;
    const COST_HIGHWAY = 1;        // Super-speed road
    const COST_OPEN    = 2;        // Normal terrain
    const COST_MUD     = 8;        // Sludge/Swamp
    const COST_BLOCK   = 255;      // Impassable wall
    const DX = [1, -1, 0, 0, 1, -1, 1, -1];
    const DY = [0, 0, 1, -1, 1, 1, -1, -1];
    const DL = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    const octile = (dx, dy) => {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      return ax > ay ? ax + OCT * ay : ay + OCT * ax;
    };
    const mulberry32 = s => () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    const createOffscreen = (w, h) => Object.assign(
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas'),
      { width: w, height: h }
    );
    return {
      CS, CC, SQ2, OCT, MAX_AGENTS, FIXED_DT,
      COST_HIGHWAY, COST_OPEN, COST_MUD, COST_BLOCK,
      DX, DY, DL, clamp, octile, mulberry32, createOffscreen
    };
  })();
  //#endregion

  //#region 4b: SharedMemoryAndAtomicsRuntime
  const {
    SUPPORTS_SAB, CTRL, CTRL_F, TASK, FLOW_CAP, MAX_CHUNKS, MAX_CELLS,
    MAX_BUCKETS, MAX_PORTALS, MAX_EDGES, MAX_CORRIDORS, MAX_CORRIDOR_STEPS,
    HASH_BATCH_SIZE, MAX_HASH_BATCHES, SEP_BATCH_SIZE, STEER_BATCH_SIZE,
    SHARED_ARENA, WORKER_POOL
  } = (() => {
    const CACHE_LINE = 64;
    const align64 = bytes => (bytes + (CACHE_LINE - 1)) & ~(CACHE_LINE - 1);

    const MAX_CHUNKS = 24 * 18;
    const MAX_CELLS = MAX_CHUNKS * CC;
    const MAX_BUCKETS = 320 * 240;
    const MAX_PORTALS = 8192;
    const MAX_EDGES = 131072;
    const FLOW_CAP = 2048;
    const MAX_CORRIDORS = 8192;
    const MAX_CORRIDOR_STEPS = 256;

    const HASH_BATCH_SIZE = 1024;
    const MAX_HASH_BATCHES = Math.ceil(MAX_AGENTS / HASH_BATCH_SIZE);
    const BUCKET_REDUCE_BATCH = 512;
    const SEP_BATCH_SIZE = 128;
    const STEER_BATCH_SIZE = 128;
    const PATH_BATCH_SIZE = 16;
    const MAX_TASK_BATCHES = 512;
    const PHASE_RING = 4; // 4-way ring-buffered phase state eliminates cross-phase worker bleed

    // 64-byte cache-line padded Int32 control indices
    const CTRL = {
      TASK_EPOCH: 0,
      SPIN_MODE: 1,
      WORLD_VERSION: 2,
      ONLINE_WORKERS: 3,
      TARGET_WORKERS: 4,

      // 4-element ring arrays indexed by (epoch & 3)
      TASK_TYPE_0: 8,        // 8..11
      TOTAL_BATCHES_0: 12,   // 12..15

      // Cache-line isolated per-ring-slot atomic cursors & completion counters
      WORK_CURSOR_0: 16,     // 16, 32, 48, 64 (stride 16 = 64B cache line each)
      DONE_BATCHES_0: 80,    // 80, 96, 112, 128 (stride 16 = 64B cache line each)

      RENDER_READY_SLOT: 144,
      ACTIVE_AGENTS: 145,
      ARRIVED_COUNT: 146,
      FRAME_NUM: 147,
      FLOW_ALLOC_COUNT: 148,
      CORRIDOR_ALLOC_COUNT: 149,

      URGENT_HEAD: 160,
      URGENT_TAIL: 161,
      BULK_HEAD: 162,
      BULK_TAIL: 163,

      GRID_W: 176,
      GRID_H: 177,
      GRID_CX: 178,
      GRID_CY: 179,
      PORTAL_COUNT: 180,
      EDGE_COUNT: 181,
      GOAL_CELL: 182,
      GOAL_CHUNK: 183,
      HASH_COLS: 184,
      HASH_ROWS: 185,
      HASH_BUCKETS: 186,
      HASH_NUM_BATCHES: 187
    };

    const CTRL_F = {
      DT: 0,
      AGENT_RADIUS: 1,
      MAX_SPEED: 2,
      STEERING_GAIN: 3,
      SEP_STRENGTH: 4,
      HASH_CS: 5,
      GOAL_X: 6,
      GOAL_Y: 7,
      CONTAG_R: 8,
      LEAVE_R: 9
    };

    const TASK = {
      IDLE: 0,
      PATHFIND_URGENT: 1,
      PATHFIND_BULK: 2,
      HASH_COUNT: 3,
      HASH_BUCKET_REDUCE: 4,
      HASH_SCATTER: 5,
      SEPARATION: 6,
      STEER_COLLIDE: 7,
      EXIT: 99
    };

    let SUPPORTS_SAB = false;
    try {
      if (typeof SharedArrayBuffer !== 'undefined') {
        new SharedArrayBuffer(64);
        SUPPORTS_SAB = true;
      }
    } catch {
      SUPPORTS_SAB = false;
    }

    class TripleBufferBridge {
      constructor(ctrl) {
        this.ctrl = ctrl;
        this.workerWriteSlot = 0;
        this.mainReadSlot = 1;
        Atomics.store(this.ctrl, CTRL.RENDER_READY_SLOT, 2);
      }
      publishWorkerFrame(px, py, vx, vy, state, rPx, rPy, rVx, rVy, rState, n) {
        const slot = this.workerWriteSlot;
        const base = slot * MAX_AGENTS;
        rPx.set(px.subarray(0, n), base);
        rPy.set(py.subarray(0, n), base);
        rVx.set(vx.subarray(0, n), base);
        rVy.set(vy.subarray(0, n), base);
        rState.set(state.subarray(0, n), base);
        const nextPacked = slot | 4;
        const prevPacked = Atomics.exchange(this.ctrl, CTRL.RENDER_READY_SLOT, nextPacked);
        this.workerWriteSlot = prevPacked & 3;
      }
      acquireRenderFrame() {
        const current = Atomics.load(this.ctrl, CTRL.RENDER_READY_SLOT);
        if ((current & 4) === 0) return this.mainReadSlot;
        const prevPacked = Atomics.exchange(this.ctrl, CTRL.RENDER_READY_SLOT, this.mainReadSlot);
        this.mainReadSlot = prevPacked & 3;
        return this.mainReadSlot;
      }
    }

    function createSharedArena() {
      let offset = 0;
      const descriptors = {};
      const reserve = (name, TypedArr, length) => {
        offset = align64(offset);
        const byteLength = length * TypedArr.BYTES_PER_ELEMENT;
        descriptors[name] = { TypedArr, offset, length };
        offset += byteLength;
      };

      reserve('ctrl', Int32Array, 256);
      reserve('ctrlFloat', Float64Array, 32);
      reserve('batchState', Int32Array, PHASE_RING * MAX_TASK_BATCHES);

      // 1. Agent SoA Pool
      reserve('px', Float32Array, MAX_AGENTS);
      reserve('py', Float32Array, MAX_AGENTS);
      reserve('vx', Float32Array, MAX_AGENTS);
      reserve('vy', Float32Array, MAX_AGENTS);
      reserve('sepX', Float32Array, MAX_AGENTS);
      reserve('sepY', Float32Array, MAX_AGENTS);
      reserve('corrX', Float32Array, MAX_AGENTS);
      reserve('corrY', Float32Array, MAX_AGENTS);
      reserve('repathCd', Float32Array, MAX_AGENTS);
      reserve('state', Uint8Array, MAX_AGENTS);
      reserve('queued', Uint8Array, MAX_AGENTS);
      reserve('touching', Uint8Array, MAX_AGENTS);
      reserve('pathIdx', Int32Array, MAX_AGENTS);
      reserve('goalCell', Int32Array, MAX_AGENTS);
      reserve('corridorSlot', Int32Array, MAX_AGENTS);
      reserve('fieldSlot', Int32Array, MAX_AGENTS);

      // 2. Lock-Free Triple-Buffered Render Snapshots
      reserve('renderPx', Float32Array, MAX_AGENTS * 3);
      reserve('renderPy', Float32Array, MAX_AGENTS * 3);
      reserve('renderVx', Float32Array, MAX_AGENTS * 3);
      reserve('renderVy', Float32Array, MAX_AGENTS * 3);
      reserve('renderState', Uint8Array, MAX_AGENTS * 3);

      // 3. Contention-Free Parallel Spatial Hash (Per-Batch Histograms)
      reserve('hashStart', Int32Array, MAX_BUCKETS + 1);
      reserve('hashCur', Int32Array, MAX_BUCKETS);
      reserve('hashItems', Int32Array, MAX_AGENTS);
      reserve('hashBucketOf', Int32Array, MAX_AGENTS);
      reserve('batchHist', Int32Array, MAX_HASH_BATCHES * MAX_BUCKETS);
      reserve('batchOffset', Int32Array, MAX_HASH_BATCHES * MAX_BUCKETS);

      // 4. Shared FlowField Slab Cache (2048 slots x 256 cells)
      reserve('flowKeys', Float64Array, FLOW_CAP);
      reserve('flowState', Int32Array, FLOW_CAP);
      reserve('flowMeta', Int32Array, FLOW_CAP * 6); // [chunkId, kindCode, originX, originY, usageFrame, usageCount]
      reserve('flowIntegration', Float32Array, FLOW_CAP * CC);
      reserve('flowX', Float32Array, FLOW_CAP * CC);
      reserve('flowY', Float32Array, FLOW_CAP * CC);
      reserve('chunkBestSlot', Int32Array, MAX_CHUNKS);
      reserve('chunkBestCount', Int32Array, MAX_CHUNKS);

      // 5. Shared Grid & Portal Graph Topology
      reserve('gridCosts', Uint8Array, MAX_CELLS);
      reserve('portalIsH', Uint8Array, MAX_PORTALS);
      reserve('portalChunkA', Int32Array, MAX_PORTALS);
      reserve('portalChunkB', Int32Array, MAX_PORTALS);
      reserve('portalCenterA', Int32Array, MAX_PORTALS);
      reserve('portalCenterB', Int32Array, MAX_PORTALS);
      reserve('portalUid', Int32Array, MAX_PORTALS);
      reserve('portalAnchorX', Float32Array, MAX_PORTALS);
      reserve('portalAnchorY', Float32Array, MAX_PORTALS);
      reserve('portalCellsOffset', Int32Array, MAX_PORTALS + 1);
      reserve('portalCellsA', Int32Array, MAX_PORTALS * CS);
      reserve('portalCellsB', Int32Array, MAX_PORTALS * CS);
      reserve('chunkPortalOffsets', Int32Array, MAX_CHUNKS + 1);
      reserve('chunkPortalIds', Int32Array, MAX_PORTALS * 2);
      reserve('edgeOffsets', Int32Array, MAX_PORTALS + 1);
      reserve('edgeTargets', Int32Array, MAX_EDGES);
      reserve('edgeCosts', Float64Array, MAX_EDGES);
      reserve('edgeChunks', Int32Array, MAX_EDGES);
      reserve('goalPortalCost', Float64Array, MAX_PORTALS);
      reserve('goalField', Float64Array, CC);
      reserve('portalTargets', Int32Array, MAX_PORTALS);
      reserve('portalOnPath', Uint8Array, MAX_PORTALS);

      // 6. Shared Macro Corridor Slab & Cell-Deduplication Table
      reserve('cellCorridorSlot', Int32Array, MAX_CELLS);
      reserve('corridorLen', Int32Array, MAX_CORRIDORS);
      reserve('corridorGoalCell', Int32Array, MAX_CORRIDORS);
      reserve('corridorGraphVer', Int32Array, MAX_CORRIDORS);
      reserve('corridorCost', Float64Array, MAX_CORRIDORS);
      reserve('corridorGoalX', Float32Array, MAX_CORRIDORS);
      reserve('corridorGoalY', Float32Array, MAX_CORRIDORS);
      reserve('corridorChunks', Int16Array, MAX_CORRIDORS * MAX_CORRIDOR_STEPS);
      reserve('corridorPortals', Int16Array, MAX_CORRIDORS * MAX_CORRIDOR_STEPS);

      // 7. Lock-Free MPMC Path Request Queues
      reserve('urgentQBuf', Int32Array, MAX_AGENTS * 2);
      reserve('bulkQBuf', Int32Array, MAX_AGENTS * 2);

      const totalBytes = align64(offset);
      const buffer = SUPPORTS_SAB ? new SharedArrayBuffer(totalBytes) : new ArrayBuffer(totalBytes);

      const views = {};
      for (const [name, desc] of Object.entries(descriptors)) {
        views[name] = new desc.TypedArr(buffer, desc.offset, desc.length);
      }

      views.corridorSlot.fill(-1);
      views.fieldSlot.fill(-1);
      views.cellCorridorSlot.fill(-1);
      views.chunkBestSlot.fill(-1);

      const tripleBuffer = new TripleBufferBridge(views.ctrl);
      const corridorObjCache = new Array(MAX_CORRIDORS).fill(null);
      let currentGraphRef = null;

      return {
        buffer,
        descriptors,
        totalBytes,
        views,
        tripleBuffer,
        setGraphRef(graph) {
          currentGraphRef = graph;
          views.cellCorridorSlot.fill(-1);
          Atomics.store(views.ctrl, CTRL.CORRIDOR_ALLOC_COUNT, 0);
          corridorObjCache.fill(null);
        },
        resetGoalCorridors() {
          // Only clear cell-to-corridor lookup table; do NOT reset CORRIDOR_ALLOC_COUNT
          // to 0 so agents still in bulkQ can safely read their previous corridor slots!
          views.cellCorridorSlot.fill(-1);
        },
        getCorridorObject(cSlot) {
          if (cSlot < 0 || cSlot >= MAX_CORRIDORS) return null;
          let obj = corridorObjCache[cSlot];
          const ver = Atomics.load(views.ctrl, CTRL.WORLD_VERSION);
          const gCell = views.corridorGoalCell[cSlot];
          const cLen = Atomics.load(views.corridorLen, cSlot);
          if (cLen <= 0) return null;
          if (obj && obj._ver === ver && obj.goalCell === gCell && obj.chunks.length === cLen) {
            return obj;
          }
          const pLen = cLen - 1;
          const base = cSlot * MAX_CORRIDOR_STEPS;
          const chunks = new Int32Array(cLen);
          const portals = new Int32Array(pLen);
          for (let k = 0; k < cLen; k++) chunks[k] = views.corridorChunks[base + k];
          for (let k = 0; k < pLen; k++) portals[k] = views.corridorPortals[base + k];
          obj = {
            portals,
            chunks,
            cost: views.corridorCost[cSlot],
            goalCell: gCell,
            goalX: views.corridorGoalX[cSlot],
            goalY: views.corridorGoalY[cSlot],
            graph: currentGraphRef,
            _ver: ver
          };
          corridorObjCache[cSlot] = obj;
          return obj;
        }
      };
    }

    // Shared Kernel Factory used by both Main-Thread Coordinator and Web Workers
    function buildSharedKernel(views) {
      const {
        ctrl, ctrlFloat, px, py, vx, vy, sepX, sepY, corrX, corrY, repathCd,
        state, queued, touching, pathIdx, goalCell, corridorSlot, fieldSlot,
        hashStart, hashItems, hashBucketOf, batchHist, batchOffset,
        flowKeys, flowState, flowMeta, flowIntegration, flowX, flowY,
        chunkBestSlot, chunkBestCount, gridCosts,
        portalIsH, portalChunkA, portalChunkB, portalCenterA, portalCenterB,
        portalUid, portalAnchorX, portalAnchorY, portalCellsOffset, portalCellsA, portalCellsB,
        chunkPortalOffsets, chunkPortalIds, edgeOffsets, edgeTargets, edgeCosts, edgeChunks,
        goalPortalCost, goalField, portalTargets, portalOnPath,
        cellCorridorSlot, corridorLen, corridorGoalCell, corridorGraphVer, corridorCost,
        corridorGoalX, corridorGoalY, corridorChunks, corridorPortals,
        urgentQBuf, bulkQBuf
      } = views;

      // Thread-local scratch structures for Eikonal integration and Macro A*
      const heapIt = new Int32Array(MAX_PORTALS + 512);
      const heapK = new Float64Array(MAX_PORTALS + 512);
      let heapSz = 0, heapLastKey = 0;
      const heapClear = () => { heapSz = 0; };
      const heapPush = (item, key) => {
        let c = heapSz++, p;
        while (c > 0 && heapK[p = (c - 1) >> 1] > key) {
          heapIt[c] = heapIt[p]; heapK[c] = heapK[p]; c = p;
        }
        heapIt[c] = item; heapK[c] = key;
      };
      const heapPop = () => {
        const top = heapIt[0], li = --heapSz, item = heapIt[li], key = heapK[li];
        heapLastKey = heapK[0];
        let p = 0, ch;
        while ((ch = p * 2 + 1) < li) {
          if (ch + 1 < li && heapK[ch + 1] < heapK[ch]) ch++;
          if (heapK[ch] >= key) break;
          heapIt[p] = heapIt[ch]; heapK[p] = heapK[ch]; p = ch;
        }
        heapIt[p] = item; heapK[p] = key;
        return top;
      };

      const eikCosts = new Uint8Array(CC);
      const eikDist = new Float64Array(CC);
      const localFlowInt = new Float32Array(CC);
      const localFlowX = new Float32Array(CC);
      const localFlowY = new Float32Array(CC);
      const aStarG = new Float64Array(MAX_PORTALS + 2);
      const aStarParent = new Int32Array(MAX_PORTALS + 2);
      const aStarParentChunk = new Int32Array(MAX_PORTALS + 2);
      const aStarSeen = new Uint32Array(MAX_PORTALS + 2);
      const aStarClosed = new Uint32Array(MAX_PORTALS + 2);
      const startFieldScratch = new Float64Array(CC);
      const tempSources = new Int32Array(CS);
      const headingScratch = { x: 0, y: 0 };
      let aStarStamp = 1;

      function integrateChunkFlat(W, cx, chunkId, sources, numSources, out) {
        const ox = (chunkId % cx) * CS, oy = (chunkId / cx | 0) * CS;
        for (let ly = 0, r = oy * W + ox; ly < CS; ly++, r += W) {
          for (let lx = 0; lx < CS; lx++) eikCosts[ly * CS + lx] = gridCosts[r + lx];
        }
        eikDist.fill(Infinity);
        heapClear();
        for (let i = 0; i < numSources; i++) {
          const cell = sources[i];
          if (eikCosts[cell] < COST_BLOCK && eikDist[cell]) {
            eikDist[cell] = 0;
            heapPush(cell, 0);
          }
        }
        while (heapSz > 0) {
          const u = heapPop(), du = heapLastKey;
          if (du > eikDist[u]) continue;
          const ux = u % CS, uy = u / CS | 0, cu = eikCosts[u];
          for (let d = 0; d < 8; d++) {
            const nx = ux + DX[d], ny = uy + DY[d];
            if (nx >>> 0 >= CS || ny >>> 0 >= CS) continue;
            const v = ny * CS + nx, cv = eikCosts[v];
            if (cv >= COST_BLOCK || (d >= 4 && (eikCosts[uy * CS + nx] >= COST_BLOCK || eikCosts[ny * CS + ux] >= COST_BLOCK))) continue;
            const nd = du + DL[d] * ((cu + cv) * 0.25);
            if (nd < eikDist[v]) {
              eikDist[v] = nd;
              heapPush(v, nd);
            }
          }
        }
        for (let i = 0; i < CC; i++) out[i] = eikDist[i];
      }

      function computeFlowVectorsFlat(I, FX, FY, exX, exY) {
        const at = (x, y) => x >>> 0 >= CS || y >>> 0 >= CS ? Infinity : I[y * CS + x];
        for (let y = 0; y < CS; y++) {
          for (let x = 0; x < CS; x++) {
            const id = y * CS + x, cur = I[id];
            if (cur === Infinity) { FX[id] = FY[id] = 0; continue; }
            if (!cur) { FX[id] = exX; FY[id] = exY; continue; }
            const E = at(x + 1, y), W = at(x - 1, y), S = at(x, y + 1), N = at(x, y - 1);
            const gx = E < W ? (E < cur ? E - cur : 0) : W < cur ? cur - W : 0;
            const gy = S < N ? (S < cur ? S - cur : 0) : N < cur ? cur - N : 0;
            let dx = -gx, dy = -gy, len = Math.hypot(dx, dy), ok = len > 1e-6;
            if (ok) {
              dx /= len; dy /= len;
              if (Math.abs(dx) > 0.25 && Math.abs(dy) > 0.25 && at(x + (dx > 0 ? 1 : -1), y + (dy > 0 ? 1 : -1)) === Infinity) ok = false;
            }
            if (!ok) {
              let bS = 0, bx = 0, by = 0;
              for (let d = 0; d < 8; d++) {
                const nx = x + DX[d], ny = y + DY[d], v = at(nx, ny);
                if (v === Infinity || (d >= 4 && (at(nx, y) === Infinity || at(x, ny) === Infinity))) continue;
                const sl = (cur - v) / DL[d];
                if (sl > bS) { bS = sl; bx = DX[d]; by = DY[d]; }
              }
              len = Math.hypot(bx, by);
              dx = bx / len || 0; dy = by / len || 0;
            }
            FX[id] = dx; FY[id] = dy;
          }
        }
      }

      function sampleFlowBilinearFlat(slot, pxVal, pyVal, out) {
        const mBase = slot * 6;
        const originX = flowMeta[mBase + 2], originY = flowMeta[mBase + 3];
        const lx = pxVal - originX - 0.5, ly = pyVal - originY - 0.5;
        const x0 = Math.floor(lx), y0 = Math.floor(ly);
        const tx = lx - x0, ty = ly - y0;
        const cBase = slot * CC;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const cx0 = x0 < 0 ? 0 : (x0 > 15 ? 15 : x0);
        const cx1 = (x0 + 1) < 0 ? 0 : ((x0 + 1) > 15 ? 15 : (x0 + 1));
        const cy0 = y0 < 0 ? 0 : (y0 > 15 ? 15 : y0);
        const cy1 = (y0 + 1) < 0 ? 0 : ((y0 + 1) > 15 ? 15 : (y0 + 1));
        let sx = 0, sy = 0, ws = 0;
        if (w00 > 0) { const id = cBase + cy0 * 16 + cx0; if (flowIntegration[id] < Infinity) { sx += flowX[id] * w00; sy += flowY[id] * w00; ws += w00; } }
        if (w10 > 0) { const id = cBase + cy0 * 16 + cx1; if (flowIntegration[id] < Infinity) { sx += flowX[id] * w10; sy += flowY[id] * w10; ws += w10; } }
        if (w01 > 0) { const id = cBase + cy1 * 16 + cx0; if (flowIntegration[id] < Infinity) { sx += flowX[id] * w01; sy += flowY[id] * w01; ws += w01; } }
        if (w11 > 0) { const id = cBase + cy1 * 16 + cx1; if (flowIntegration[id] < Infinity) { sx += flowX[id] * w11; sy += flowY[id] * w11; ws += w11; } }
        if (ws < 1e-6) return false;
        const len = Math.hypot(sx, sy);
        if (len < 0.15 * ws) {
          const c = cBase + clamp(Math.floor(pyVal - originY), 0, CS - 1) * CS + clamp(Math.floor(pxVal - originX), 0, CS - 1);
          if (flowIntegration[c] < Infinity && (flowX[c] || flowY[c])) { out.x = flowX[c]; out.y = flowY[c]; return true; }
          if (len < 1e-6) return false;
        }
        out.x = sx / len; out.y = sy / len;
        return true;
      }

      function getOrBuildFlowFieldShared(chunkId, kindCode, tid, sources, numSources, exX, exY, canWait) {
        const key = (tid * 2 + kindCode) * 65536 + chunkId;
        const mask = FLOW_CAP - 1;
        // Full 32-bit avalanche hash mixing tid, kindCode, and chunkId across all 2048 slots
        let h = Math.imul((tid << 1) | kindCode, 0x9e3779b1) ^ Math.imul(chunkId + 1, 0x85ebca6b);
        h ^= h >>> 16;
        h = Math.imul(h, 0x7feb352d);
        h ^= h >>> 15;
        let slot = (h >>> 0) & mask;
        const W = ctrl[CTRL.GRID_W], cx = ctrl[CTRL.GRID_CX];

        for (let probe = 0; probe < FLOW_CAP; probe++) {
          const st = Atomics.load(flowState, slot);
          if (st === 2 && flowKeys[slot] === key) return slot;

          if (st === 0) {
            if (Atomics.compareExchange(flowState, slot, 0, 1) === 0) {
              // Build into thread-local buffers first so no reader ever observes partial integration
              integrateChunkFlat(W, cx, chunkId, sources, numSources, localFlowInt);
              computeFlowVectorsFlat(localFlowInt, localFlowX, localFlowY, exX, exY);

              const cBase = slot * CC;
              flowIntegration.set(localFlowInt, cBase);
              flowX.set(localFlowX, cBase);
              flowY.set(localFlowY, cBase);

              const mBase = slot * 6;
              flowMeta[mBase] = chunkId;
              flowMeta[mBase + 1] = kindCode;
              flowMeta[mBase + 2] = (chunkId % cx) * CS;
              flowMeta[mBase + 3] = (chunkId / cx | 0) * CS;
              flowMeta[mBase + 4] = -1;
              flowMeta[mBase + 5] = 0;
              flowKeys[slot] = key;

              Atomics.add(ctrl, CTRL.FLOW_ALLOC_COUNT, 1);
              Atomics.store(flowState, slot, 2);
              if (SUPPORTS_SAB) Atomics.notify(flowState, slot);
              return slot;
            }
            probe--;
            continue;
          }

          if (st === 1) {
            let spins = 0;
            while (Atomics.load(flowState, slot) === 1 && ++spins < 50000) {}
            if (canWait && SUPPORTS_SAB && Atomics.load(flowState, slot) === 1) {
              Atomics.wait(flowState, slot, 1, 5);
            }
            if (Atomics.load(flowState, slot) === 2 && flowKeys[slot] === key) return slot;
          }

          slot = (slot + 1) & mask;
        }

        // Safe atomic eviction into thread-local buffer first
        const evictSlot = (h >>> 0) & mask;
        integrateChunkFlat(W, cx, chunkId, sources, numSources, localFlowInt);
        computeFlowVectorsFlat(localFlowInt, localFlowX, localFlowY, exX, exY);
        const cBase = evictSlot * CC;
        flowIntegration.set(localFlowInt, cBase);
        flowX.set(localFlowX, cBase);
        flowY.set(localFlowY, cBase);
        const mBase = evictSlot * 6;
        flowMeta[mBase] = chunkId;
        flowMeta[mBase + 1] = kindCode;
        flowMeta[mBase + 2] = (chunkId % cx) * CS;
        flowMeta[mBase + 3] = (chunkId / cx | 0) * CS;
        flowMeta[mBase + 4] = -1;
        flowMeta[mBase + 5] = 0;
        flowKeys[evictSlot] = key;
        Atomics.store(flowState, evictSlot, 2);
        return evictSlot;
      }

      function resolvePortalFieldShared(chunkId, pid, canWait) {
        const uid = portalUid[pid];
        const isA = chunkId === portalChunkA[pid];
        const isH = portalIsH[pid] === 1;
        const exX = isH ? 0 : isA ? 1 : -1;
        const exY = isH ? (isA ? 1 : -1) : 0;
        const W = ctrl[CTRL.GRID_W];
        const c0 = portalCellsOffset[pid], c1 = portalCellsOffset[pid + 1];
        const numSrc = c1 - c0;
        const srcArr = isA ? portalCellsA : portalCellsB;
        for (let k = 0; k < numSrc; k++) {
          const cell = srcArr[c0 + k];
          tempSources[k] = ((cell / W | 0) % CS) * CS + (cell % W % CS);
        }
        return getOrBuildFlowFieldShared(chunkId, 0, uid, tempSources, numSrc, exX, exY, canWait);
      }

      function resolveGoalFieldShared(chunkId, gCell, canWait) {
        const W = ctrl[CTRL.GRID_W];
        tempSources[0] = ((gCell / W | 0) % CS) * CS + (gCell % W % CS);
        return getOrBuildFlowFieldShared(chunkId, 1, gCell, tempSources, 1, 0, 0, canWait);
      }

      function findNearestWalkableFlat(x, y, maxR = 24) {
        const W = ctrl[CTRL.GRID_W], H = ctrl[CTRL.GRID_H];
        const sx = clamp(x | 0, 0, W - 1), sy = clamp(y | 0, 0, H - 1);
        if (gridCosts[sy * W + sx] < COST_BLOCK) return sy * W + sx;
        let bestD = Infinity, bestI = -1;
        for (let r = 1, lim = Math.min(maxR, Math.max(W, H)); r <= lim; r++) {
          const r2 = r * r;
          for (let dy = -r; dy <= r; dy++) {
            const ny = sy + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -r; dx <= r; dx++) {
              if (dx * dx < r2 && dy * dy < r2) continue;
              const nx = sx + dx;
              if (nx >= 0 && nx < W) {
                const idx = ny * W + nx, d = dx * dx + dy * dy;
                if (gridCosts[idx] < COST_BLOCK && d < bestD) { bestD = d; bestI = idx; }
              }
            }
          }
          if (bestI >= 0) return bestI;
        }
        return -1;
      }

      function findMacroPathIntoSlab(startCell, canWait) {
        let existing = Atomics.load(cellCorridorSlot, startCell);
        if (existing >= 0) return existing;
        if (existing === -3) return -1;

        if (existing === -1) {
          if (Atomics.compareExchange(cellCorridorSlot, startCell, -1, -2) !== -1) {
            existing = Atomics.load(cellCorridorSlot, startCell);
          }
        }
        if (existing === -2) {
          let spins = 0;
          while (Atomics.load(cellCorridorSlot, startCell) === -2 && ++spins < 50000) {}
          if (canWait && SUPPORTS_SAB && Atomics.load(cellCorridorSlot, startCell) === -2) {
            Atomics.wait(cellCorridorSlot, startCell, -2, 5);
          }
          const resolved = Atomics.load(cellCorridorSlot, startCell);
          if (resolved >= 0) return resolved;
          if (resolved === -3) return -1;
        }

        const W = ctrl[CTRL.GRID_W], cx = ctrl[CTRL.GRID_CX];
        const P = ctrl[CTRL.PORTAL_COUNT], START = P, GOAL = P + 1;
        const gCell = ctrl[CTRL.GOAL_CELL], gChunk = ctrl[CTRL.GOAL_CHUNK];
        const gx = ctrlFloat[CTRL_F.GOAL_X], gy = ctrlFloat[CTRL_F.GOAL_Y];

        if (++aStarStamp >= 0xffffffff) {
          aStarSeen.fill(0);
          aStarClosed.fill(0);
          aStarStamp = 1;
        }
        const s = aStarStamp;
        const sx = startCell % W, sy = startCell / W | 0;
        const sc = (sy / CS | 0) * cx + (sx / CS | 0);
        tempSources[0] = (sy % CS) * CS + (sx % CS);
        integrateChunkFlat(W, cx, sc, tempSources, 1, startFieldScratch);

        heapClear();
        aStarG[START] = 0;
        aStarSeen[START] = s;
        aStarParent[START] = -1;
        aStarParentChunk[START] = sc;
        heapPush(START, octile(sx + 0.5 - gx, sy + 0.5 - gy));

        const relax = (v, cost, from, chunk) => {
          if (aStarClosed[v] === s || (aStarSeen[v] === s && cost >= aStarG[v])) return;
          aStarSeen[v] = s;
          aStarG[v] = cost;
          aStarParent[v] = from;
          aStarParentChunk[v] = chunk;
          const h = v < P ? Math.max(0, octile(portalAnchorX[v] - gx, portalAnchorY[v] - gy) - 0.5) : 0;
          heapPush(v, cost + h);
        };

        while (heapSz > 0) {
          const u = heapPop();
          if (aStarClosed[u] === s) continue;
          aStarClosed[u] = s;

          if (u === GOAL) {
            const rawIdx = Atomics.add(ctrl, CTRL.CORRIDOR_ALLOC_COUNT, 1);
            const cSlot = rawIdx % MAX_CORRIDORS;
            let countChunks = 1;
            let n = aStarParent[GOAL];
            while (n !== START && countChunks < MAX_CORRIDOR_STEPS) {
              countChunks++;
              n = aStarParent[n];
            }
            const base = cSlot * MAX_CORRIDOR_STEPS;
            corridorChunks[base + countChunks - 1] = aStarParentChunk[GOAL];
            n = aStarParent[GOAL];
            for (let k = countChunks - 2; k >= 0; k--) {
              corridorPortals[base + k] = n;
              corridorChunks[base + k] = aStarParentChunk[n];
              n = aStarParent[n];
            }
            corridorCost[cSlot] = aStarG[GOAL];
            corridorGoalCell[cSlot] = gCell;
            corridorGoalX[cSlot] = gx;
            corridorGoalY[cSlot] = gy;
            corridorGraphVer[cSlot] = ctrl[CTRL.WORLD_VERSION];
            Atomics.store(corridorLen, cSlot, countChunks);

            Atomics.store(cellCorridorSlot, startCell, cSlot);
            if (SUPPORTS_SAB) Atomics.notify(cellCorridorSlot, startCell);
            return cSlot;
          }

          const gu = aStarG[u];
          if (u === START) {
            const p0 = chunkPortalOffsets[sc], p1 = chunkPortalOffsets[sc + 1];
            for (let i = p0; i < p1; i++) {
              const pid = chunkPortalIds[i];
              const centerCell = sc === portalChunkA[pid] ? portalCenterA[pid] : portalCenterB[pid];
              const locIdx = ((centerCell / W | 0) % CS) * CS + (centerCell % W % CS);
              const d = startFieldScratch[locIdx];
              if (d < Infinity) {
                const cross = ((gridCosts[portalCenterA[pid]] + gridCosts[portalCenterB[pid]]) * 0.5) / COST_OPEN;
                relax(pid, gu + d + cross, START, sc);
              }
            }
            if (sc === gChunk) {
              const d = goalField[(sy % CS) * CS + (sx % CS)];
              if (d < Infinity) relax(GOAL, gu + d, START, sc);
            }
          } else {
            const e0 = edgeOffsets[u], e1 = edgeOffsets[u + 1];
            for (let e = e0; e < e1; e++) {
              relax(edgeTargets[e], gu + edgeCosts[e], u, edgeChunks[e]);
            }
            const gc = goalPortalCost[u];
            if (gc < Infinity) relax(GOAL, gu + gc, u, gChunk);
          }
        }

        Atomics.store(cellCorridorSlot, startCell, -3);
        if (SUPPORTS_SAB) Atomics.notify(cellCorridorSlot, startCell);
        return -1;
      }

      function computePathForAgentFlat(i, canWait) {
        Atomics.store(queued, i, 0);
        const n = ctrl[CTRL.ACTIVE_AGENTS];
        if (i < 0 || i >= n) return;
        const gCell = ctrl[CTRL.GOAL_CELL];
        if (gCell < 0) {
          state[i] = 0;
          corridorSlot[i] = -1;
          fieldSlot[i] = -1;
          goalCell[i] = -1;
          return;
        }
        const W = ctrl[CTRL.GRID_W], H = ctrl[CTRL.GRID_H];
        const cx = clamp(px[i] | 0, 0, W - 1), cy = clamp(py[i] | 0, 0, H - 1);
        const start = gridCosts[cy * W + cx] < COST_BLOCK ? (cy * W + cx) : findNearestWalkableFlat(cx, cy, 12);
        const cSlot = start >= 0 ? findMacroPathIntoSlab(start, canWait) : -1;
        fieldSlot[i] = -1;
        if (cSlot < 0) {
          state[i] = 3;
          corridorSlot[i] = -1;
          goalCell[i] = gCell;
          return;
        }
        state[i] = (state[i] === 2 && goalCell[i] === gCell) ? 2 : 1;
        corridorSlot[i] = cSlot;
        pathIdx[i] = 0;
        goalCell[i] = gCell;
      }

      function enqueueUrgentFlat(i) {
        if (repathCd[i] > 0) return;
        if (Atomics.compareExchange(queued, i, 0, 1) === 0) {
          repathCd[i] = 0.35;
          const cap = urgentQBuf.length;
          const tail = Atomics.add(ctrl, CTRL.URGENT_TAIL, 1);
          urgentQBuf[tail % cap] = i;
        }
      }

      function resolveFieldForAgentFlat(i, canWait) {
        const W = ctrl[CTRL.GRID_W], H = ctrl[CTRL.GRID_H], gCx = ctrl[CTRL.GRID_CX];
        const cx = clamp(px[i] | 0, 0, W - 1), cy = clamp(py[i] | 0, 0, H - 1);
        const chunk = (cy / CS | 0) * gCx + (cx / CS | 0);
        const cSlot = corridorSlot[i];
        const worldVer = ctrl[CTRL.WORLD_VERSION];

        if (cSlot < 0 || corridorGraphVer[cSlot] !== worldVer) {
          enqueueUrgentFlat(i);
          const fSlot = fieldSlot[i];
          return (fSlot >= 0 && flowMeta[fSlot * 6] === chunk) ? fSlot : -1;
        }

        const cLen = corridorLen[cSlot];
        if (cLen <= 0) {
          enqueueUrgentFlat(i);
          return -1;
        }
        const pLen = cLen - 1;
        const cBase = cSlot * MAX_CORRIDOR_STEPS;
        let idx = pathIdx[i];
        if (idx < 0 || idx >= cLen) {
          idx = pathIdx[i] = 0;
          fieldSlot[i] = -1;
        }

        if (corridorChunks[cBase + idx] !== chunk) {
          let found = -1;
          for (let k = idx + 1; k < cLen; k++) {
            if (corridorChunks[cBase + k] === chunk) { found = k; break; }
          }
          if (found < 0) {
            for (let k = idx - 1; k >= 0; k--) {
              if (corridorChunks[cBase + k] === chunk) { found = k; break; }
            }
          }
          if (found < 0) {
            fieldSlot[i] = -1;
            enqueueUrgentFlat(i);
            return -1;
          }
          pathIdx[i] = idx = found;
          fieldSlot[i] = -1;
        }

        let fSlot = fieldSlot[i];
        if (fSlot < 0 || flowMeta[fSlot * 6] !== chunk) {
          fSlot = idx < pLen
            ? resolvePortalFieldShared(chunk, corridorPortals[cBase + idx], canWait)
            : resolveGoalFieldShared(chunk, corridorGoalCell[cSlot], canWait);
          fieldSlot[i] = fSlot;
        }

        if (fSlot < 0) return -1;
        const mBase = fSlot * 6;
        const ox = flowMeta[mBase + 2], oy = flowMeta[mBase + 3];
        if (!(flowIntegration[fSlot * CC + (cy - oy) * CS + (cx - ox)] < Infinity)) {
          enqueueUrgentFlat(i);
          return -1;
        }
        return fSlot;
      }

      function collideAgentFlat(i, W, H, r) {
        let pxVal = px[i], pyVal = py[i];
        if (!Number.isFinite(pxVal) || !Number.isFinite(pyVal)) {
          const cell = findNearestWalkableFlat(W >> 1, H >> 1, 32);
          pxVal = cell >= 0 ? (cell % W) + 0.5 : W * 0.5;
          pyVal = cell >= 0 ? (cell / W | 0) + 0.5 : H * 0.5;
          vx[i] = vy[i] = 0;
        }
        let x = clamp(pxVal, r, W - r), y = clamp(pyVal, r, H - r);
        if (x !== pxVal) vx[i] = 0;
        if (y !== pyVal) vy[i] = 0;
        const ccx = Math.min(W - 1, x | 0), ccy = Math.min(H - 1, y | 0);
        if (gridCosts[ccy * W + ccx] >= COST_BLOCK) {
          const cell = findNearestWalkableFlat(ccx, ccy, 24);
          if (cell >= 0) { x = (cell % W) + 0.5; y = (cell / W | 0) + 0.5; }
          vx[i] = vy[i] = 0;
        }
        const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(W - 1, (x + r) | 0);
        const y0 = Math.max(0, (y - r) | 0), y1 = Math.min(H - 1, (y + r) | 0);
        const r2 = r * r;
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            if (gridCosts[cy * W + cx] < COST_BLOCK) continue;
            const qx = clamp(x, cx, cx + 1), qy = clamp(y, cy, cy + 1);
            const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
            if (d2 >= r2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            x += nx * (r - d); y += ny * (r - d);
            const vn = vx[i] * nx + vy[i] * ny;
            if (vn < 0) { vx[i] -= vn * nx; vy[i] -= vn * ny; }
          }
        }
        px[i] = x; py[i] = y;
      }

      function executeBatch(taskType, batchIdx, canWait) {
        const n = ctrl[CTRL.ACTIVE_AGENTS];

        if (taskType === TASK.PATHFIND_URGENT || taskType === TASK.PATHFIND_BULK) {
          const isUrgent = taskType === TASK.PATHFIND_URGENT;
          const headIdx = isUrgent ? CTRL.URGENT_HEAD : CTRL.BULK_HEAD;
          const tailIdx = isUrgent ? CTRL.URGENT_TAIL : CTRL.BULK_TAIL;
          const qBuf = isUrgent ? urgentQBuf : bulkQBuf;
          const cap = qBuf.length;
          for (let k = 0; k < PATH_BATCH_SIZE; k++) {
            const h = Atomics.load(ctrl, headIdx);
            const t = Atomics.load(ctrl, tailIdx);
            if (h >= t) break;
            if (Atomics.compareExchange(ctrl, headIdx, h, h + 1) === h) {
              const agentId = qBuf[h % cap];
              computePathForAgentFlat(agentId, canWait);
            }
          }
          return;
        }

        if (taskType === TASK.HASH_COUNT) {
          const B = ctrl[CTRL.HASH_BUCKETS], cols = ctrl[CTRL.HASH_COLS], rows = ctrl[CTRL.HASH_ROWS];
          const cs = ctrlFloat[CTRL_F.HASH_CS];
          const i0 = batchIdx * HASH_BATCH_SIZE, i1 = Math.min(n, i0 + HASH_BATCH_SIZE);
          const histBase = batchIdx * B;
          batchHist.fill(0, histBase, histBase + B);
          for (let i = i0; i < i1; i++) {
            const bx = clamp(Math.floor(px[i] / cs), 0, cols - 1) | 0;
            const by = clamp(Math.floor(py[i] / cs), 0, rows - 1) | 0;
            const b = by * cols + bx;
            hashBucketOf[i] = b;
            batchHist[histBase + b]++;
          }
          return;
        }

        if (taskType === TASK.HASH_BUCKET_REDUCE) {
          const B = ctrl[CTRL.HASH_BUCKETS], numBatches = ctrl[CTRL.HASH_NUM_BATCHES];
          const b0 = batchIdx * BUCKET_REDUCE_BATCH, b1 = Math.min(B, b0 + BUCKET_REDUCE_BATCH);
          for (let b = b0; b < b1; b++) {
            let intra = 0;
            for (let m = 0; m < numBatches; m++) {
              const idx = m * B + b;
              const cnt = batchHist[idx];
              batchOffset[idx] = intra;
              intra += cnt;
            }
            hashStart[b + 1] = intra;
          }
          return;
        }

        if (taskType === TASK.HASH_SCATTER) {
          const B = ctrl[CTRL.HASH_BUCKETS];
          const i0 = batchIdx * HASH_BATCH_SIZE, i1 = Math.min(n, i0 + HASH_BATCH_SIZE);
          const offBase = batchIdx * B;
          for (let i = i0; i < i1; i++) {
            const b = hashBucketOf[i];
            const dst = hashStart[b] + (batchOffset[offBase + b]++);
            if (dst >= 0 && dst < n) hashItems[dst] = i;
          }
          return;
        }

        if (taskType === TASK.SEPARATION) {
          const cols = ctrl[CTRL.HASH_COLS], rows = ctrl[CTRL.HASH_ROWS];
          const cs = ctrlFloat[CTRL_F.HASH_CS];
          const rad = ctrlFloat[CTRL_F.AGENT_RADIUS];
          const minDist = rad * 2, sepRad = rad * 3, sepR2 = sepRad * sepRad;
          const MAX_NEIGHBORS = 10;
          const i0 = batchIdx * SEP_BATCH_SIZE, i1 = Math.min(n, i0 + SEP_BATCH_SIZE);

          for (let i = i0; i < i1; i++) {
            const xi = px[i], yi = py[i], gi = goalCell[i];
            let sx = 0, sy = 0, cx = 0, cy = 0, touch = 0, checked = 0;
            const bx = clamp(Math.floor(xi / cs), 0, cols - 1) | 0;
            const by = clamp(Math.floor(yi / cs), 0, rows - 1) | 0;
            neighborLoop:
            for (let yy = Math.max(0, by - 1), y1 = Math.min(rows - 1, by + 1); yy <= y1; yy++) {
              for (let xx = Math.max(0, bx - 1), x1 = Math.min(cols - 1, bx + 1); xx <= x1; xx++) {
                const b = yy * cols + xx;
                for (let k = Math.max(0, hashStart[b]), end = Math.min(n, hashStart[b + 1]); k < end; k++) {
                  const j = hashItems[k];
                  if (j === i || j < 0 || j >= n) continue;
                  let dx = xi - px[j], dy = yi - py[j], d2 = dx * dx + dy * dy;
                  if (d2 >= sepR2) continue;
                  let d = Math.sqrt(d2);
                  if (d > 1e-5) { dx /= d; dy /= d; }
                  else {
                    const ang = ((Math.min(i, j) * 0.6180339887) % 1) * Math.PI * 2, s = i < j ? 1 : -1;
                    dx = Math.cos(ang) * s; dy = Math.sin(ang) * s; d = 0;
                  }
                  const w = 1 - d / sepRad;
                  sx += dx * w; sy += dy * w;
                  if (d < minDist) {
                    const push = (minDist - d) * 0.5;
                    cx += dx * push; cy += dy * push;
                    if (gi >= 0 && state[j] === 2 && goalCell[j] === gi) touch = 1;
                  }
                  if (++checked >= MAX_NEIGHBORS) break neighborLoop;
                }
              }
            }
            sepX[i] = sx; sepY[i] = sy; corrX[i] = cx; corrY[i] = cy; touching[i] = touch;
          }
          return;
        }

        if (taskType === TASK.STEER_COLLIDE) {
          const W = ctrl[CTRL.GRID_W], H = ctrl[CTRL.GRID_H];
          const frame = ctrl[CTRL.FRAME_NUM], gCell = ctrl[CTRL.GOAL_CELL], worldVer = ctrl[CTRL.WORLD_VERSION];
          const h = ctrlFloat[CTRL_F.DT], r = ctrlFloat[CTRL_F.AGENT_RADIUS];
          const maxSpeed = ctrlFloat[CTRL_F.MAX_SPEED], vmax = maxSpeed * 1.25;
          const steeringGain = ctrlFloat[CTRL_F.STEERING_GAIN], sepStrength = ctrlFloat[CTRL_F.SEP_STRENGTH];
          const contagR = ctrlFloat[CTRL_F.CONTAG_R], leaveR = ctrlFloat[CTRL_F.LEAVE_R];

          const i0 = batchIdx * STEER_BATCH_SIZE, i1 = Math.min(n, i0 + STEER_BATCH_SIZE);
          let localArrived = 0;

          for (let i = i0; i < i1; i++) {
            if (repathCd[i] > 0) repathCd[i] -= h;
            let st = state[i], dvx = 0, dvy = 0;
            const tCell = clamp(px[i] | 0, 0, W - 1) + clamp(py[i] | 0, 0, H - 1) * W;
            const tCost = gridCosts[tCell];
            const terrainMult = tCost === COST_HIGHWAY ? 1.45 : tCost === COST_MUD ? 0.55 : 1.0;

            if (st === 1) {
              const fSlot = resolveFieldForAgentFlat(i, canWait);
              const cSlot = corridorSlot[i];
              if (fSlot >= 0) {
                const mBase = fSlot * 6;
                if (sampleFlowBilinearFlat(fSlot, px[i], py[i], headingScratch)) {
                  let sp = maxSpeed * terrainMult;
                  if (flowMeta[mBase + 1] === 1 && cSlot >= 0) {
                    const d = Math.hypot(corridorGoalX[cSlot] - px[i], corridorGoalY[cSlot] - py[i]);
                    if (d < 3) sp *= Math.max(0.35, d / 3);
                  }
                  dvx = headingScratch.x * sp; dvy = headingScratch.y * sp;
                }
                if (Atomics.load(flowMeta, mBase + 4) !== frame) {
                  Atomics.store(flowMeta, mBase + 4, frame);
                  Atomics.store(flowMeta, mBase + 5, 0);
                }
                const newUsage = Atomics.add(flowMeta, mBase + 5, 1) + 1;
                const chunkId = flowMeta[mBase];
                if (newUsage > Atomics.load(chunkBestCount, chunkId)) {
                  Atomics.store(chunkBestCount, chunkId, newUsage);
                  Atomics.store(chunkBestSlot, chunkId, fSlot);
                }
              }

              if (cSlot >= 0 && corridorGraphVer[cSlot] === worldVer) {
                const idx = pathIdx[i];
                const pLen = corridorLen[cSlot] - 1;
                const cBase = cSlot * MAX_CORRIDOR_STEPS;
                if (idx >= 0 && idx < pLen) {
                  Atomics.add(portalTargets, corridorPortals[cBase + idx], 1);
                  for (let k = idx; k < pLen; k++) {
                    const pid = corridorPortals[cBase + k];
                    if (portalOnPath[pid] === 0) portalOnPath[pid] = 1;
                  }
                }
              }
            }

            const gain = st === 1 ? steeringGain : steeringGain * 0.6;
            let nvx = vx[i] + ((dvx - vx[i]) * gain + sepX[i] * sepStrength) * h;
            let nvy = vy[i] + ((dvy - vy[i]) * gain + sepY[i] * sepStrength) * h;
            if (st === 2) { nvx *= 0.65; nvy *= 0.65; }
            const sp2 = nvx * nvx + nvy * nvy;
            if (sp2 > vmax * vmax) { const sc = vmax / Math.sqrt(sp2); nvx *= sc; nvy *= sc; }
            vx[i] = nvx; vy[i] = nvy;
            px[i] += nvx * h + corrX[i] * 0.5;
            py[i] += nvy * h + corrY[i] * 0.5;
            collideAgentFlat(i, W, H, r);

            const cSlotAfter = corridorSlot[i];
            if (cSlotAfter >= 0 && (st === 1 || st === 2)) {
              const d = Math.hypot(corridorGoalX[cSlotAfter] - px[i], corridorGoalY[cSlotAfter] - py[i]);
              if (st === 1 && (d < 0.75 || (touching[i] && d < contagR))) {
                state[i] = st = 2;
              } else if (st === 2 && d > leaveR) {
                state[i] = st = 1;
                fieldSlot[i] = -1;
              }
            }
            if (st === 2 && gCell >= 0 && goalCell[i] === gCell) localArrived++;
          }

          if (localArrived > 0) {
            Atomics.add(ctrl, CTRL.ARRIVED_COUNT, localArrived);
          }
          return;
        }
      }

      return {
        integrateChunkFlat,
        computeFlowVectorsFlat,
        sampleFlowBilinearFlat,
        getOrBuildFlowFieldShared,
        resolvePortalFieldShared,
        resolveGoalFieldShared,
        findMacroPathIntoSlab,
        computePathForAgentFlat,
        executeBatch
      };
    }

    const SHARED_ARENA = createSharedArena();
    SHARED_ARENA.kernel = buildSharedKernel(SHARED_ARENA.views);

    // Self-contained Web Worker Pool using 4-way ring-buffered phase slots
    class SABWorkerPool {
      constructor(arena) {
        this.arena = arena;
        this.workers = [];
        this.targetCount = CONFIG.simulation.workerCount;
        if (SUPPORTS_SAB) {
          this.setWorkerCount(this.targetCount);
        }
        CONFIG.telemetry.sabMode = SUPPORTS_SAB
          ? 'SAB + Atomics (Isolated)'
          : 'SoA Fallback (No COOP/COEP)';
      }

      createWorkerBlobUrl() {
        if (this._blobUrl) return this._blobUrl;
        const workerSource = `
          const CS = ${CS}, CC = ${CC}, SQ2 = ${SQ2}, OCT = ${OCT}, MAX_AGENTS = ${MAX_AGENTS};
          const COST_HIGHWAY = ${COST_HIGHWAY}, COST_OPEN = ${COST_OPEN}, COST_MUD = ${COST_MUD}, COST_BLOCK = ${COST_BLOCK};
          const DX = [${DX.join(',')}], DY = [${DY.join(',')}], DL = [${DL.join(',')}];
          const FLOW_CAP = ${FLOW_CAP}, MAX_PORTALS = ${MAX_PORTALS}, MAX_CORRIDORS = ${MAX_CORRIDORS}, MAX_CORRIDOR_STEPS = ${MAX_CORRIDOR_STEPS};
          const HASH_BATCH_SIZE = ${HASH_BATCH_SIZE}, BUCKET_REDUCE_BATCH = ${BUCKET_REDUCE_BATCH};
          const SEP_BATCH_SIZE = ${SEP_BATCH_SIZE}, STEER_BATCH_SIZE = ${STEER_BATCH_SIZE}, PATH_BATCH_SIZE = ${PATH_BATCH_SIZE};
          const MAX_TASK_BATCHES = ${MAX_TASK_BATCHES};
          const SUPPORTS_SAB = true;
          const CTRL = ${JSON.stringify(CTRL)};
          const CTRL_F = ${JSON.stringify(CTRL_F)};
          const TASK = ${JSON.stringify(TASK)};
          const clamp = ${clamp.toString()};
          const octile = ${octile.toString()};
          const buildSharedKernel = ${buildSharedKernel.toString()};

          self.onmessage = function(e) {
            const { buffer, descriptors, workerId } = e.data;
            const views = {};
            const ctorMap = {
              Int32Array, Float32Array, Float64Array, Uint8Array, Int16Array, Uint32Array
            };
            for (const [name, desc] of Object.entries(descriptors)) {
              views[name] = new ctorMap[desc.typeName](buffer, desc.offset, desc.length);
            }
            const { ctrl, batchState } = views;
            const kernel = buildSharedKernel(views);

            Atomics.add(ctrl, CTRL.ONLINE_WORKERS, 1);
            let lastEpoch = Atomics.load(ctrl, CTRL.TASK_EPOCH);

            while (true) {
              if (workerId >= Atomics.load(ctrl, CTRL.TARGET_WORKERS)) {
                Atomics.wait(ctrl, CTRL.TASK_EPOCH, lastEpoch, 200);
                lastEpoch = Atomics.load(ctrl, CTRL.TASK_EPOCH);
                continue;
              }

              let epoch = Atomics.load(ctrl, CTRL.TASK_EPOCH);
              if (epoch === lastEpoch) {
                let spins = 0;
                const maxSpins = Atomics.load(ctrl, CTRL.SPIN_MODE) === 1 ? 4096 : 64;
                while ((epoch = Atomics.load(ctrl, CTRL.TASK_EPOCH)) === lastEpoch && ++spins < maxSpins) {}
                if (epoch === lastEpoch) {
                  Atomics.wait(ctrl, CTRL.TASK_EPOCH, lastEpoch, 50);
                  continue;
                }
              }
              lastEpoch = epoch;

              const ringSlot = epoch & 3;
              const taskType = Atomics.load(ctrl, CTRL.TASK_TYPE_0 + ringSlot);
              if (taskType === TASK.EXIT) break;
              if (taskType === TASK.IDLE) continue;

              const totalBatches = Atomics.load(ctrl, CTRL.TOTAL_BATCHES_0 + ringSlot);
              const cursorIdx = CTRL.WORK_CURSOR_0 + (ringSlot << 4);
              const doneIdx = CTRL.DONE_BATCHES_0 + (ringSlot << 4);
              const stateBase = ringSlot * MAX_TASK_BATCHES;

              while (Atomics.load(ctrl, CTRL.TASK_EPOCH) === epoch) {
                const b = Atomics.add(ctrl, cursorIdx, 1);
                if (b >= totalBatches) break;
                if (Atomics.compareExchange(batchState, stateBase + b, 0, 1) === 0) {
                  kernel.executeBatch(taskType, b, true);
                  Atomics.store(batchState, stateBase + b, 2);
                  Atomics.add(ctrl, doneIdx, 1);
                }
              }
            }
            Atomics.sub(ctrl, CTRL.ONLINE_WORKERS, 1);
          };
        `;
        const blob = new Blob([workerSource], { type: 'application/javascript' });
        this._blobUrl = URL.createObjectURL(blob);
        return this._blobUrl;
      }

      setWorkerCount(count) {
        this.targetCount = clamp(Math.round(count), 1, 8);
        const { ctrl } = this.arena.views;
        Atomics.store(ctrl, CTRL.TARGET_WORKERS, this.targetCount);
        if (!SUPPORTS_SAB) return;

        const serializableDesc = {};
        for (const [k, d] of Object.entries(this.arena.descriptors)) {
          serializableDesc[k] = {
            typeName: d.TypedArr.name,
            offset: d.offset,
            length: d.length
          };
        }

        while (this.workers.length < this.targetCount) {
          const workerId = this.workers.length;
          const w = new Worker(this.createWorkerBlobUrl());
          w.postMessage({
            buffer: this.arena.buffer,
            descriptors: serializableDesc,
            workerId
          });
          this.workers.push(w);
        }
        Atomics.notify(ctrl, CTRL.TASK_EPOCH);
      }

      beginFrameSpin() {
        if (!SUPPORTS_SAB || !CONFIG.simulation.parallelWorkers) return;
        const { ctrl } = this.arena.views;
        Atomics.store(ctrl, CTRL.SPIN_MODE, 1);
        Atomics.notify(ctrl, CTRL.TASK_EPOCH);
      }

      endFrameSpin() {
        if (!SUPPORTS_SAB) return;
        const { ctrl } = this.arena.views;
        Atomics.store(ctrl, CTRL.SPIN_MODE, 0);
      }

      dispatchAndComplete(taskType, totalBatches) {
        if (totalBatches <= 0) return;
        const { ctrl, batchState } = this.arena.views;
        const kernel = this.arena.kernel;

        const useWorkers = SUPPORTS_SAB &&
          CONFIG.simulation.parallelWorkers &&
          Atomics.load(ctrl, CTRL.ONLINE_WORKERS) > 0 &&
          totalBatches > 1;

        if (!useWorkers) {
          for (let b = 0; b < totalBatches; b++) {
            kernel.executeBatch(taskType, b, false);
          }
          return;
        }

        const nextEpoch = (Atomics.load(ctrl, CTRL.TASK_EPOCH) + 1) | 0;
        const ringSlot = nextEpoch & 3;
        const cursorIdx = CTRL.WORK_CURSOR_0 + (ringSlot << 4);
        const doneIdx = CTRL.DONE_BATCHES_0 + (ringSlot << 4);
        const stateBase = ringSlot * MAX_TASK_BATCHES;

        batchState.fill(0, stateBase, stateBase + totalBatches);
        Atomics.store(ctrl, cursorIdx, 0);
        Atomics.store(ctrl, doneIdx, 0);
        Atomics.store(ctrl, CTRL.TOTAL_BATCHES_0 + ringSlot, totalBatches);
        Atomics.store(ctrl, CTRL.TASK_TYPE_0 + ringSlot, taskType);

        // Publish new epoch only after all ring-slot state is initialized
        Atomics.store(ctrl, CTRL.TASK_EPOCH, nextEpoch);
        Atomics.notify(ctrl, CTRL.TASK_EPOCH);

        // Main-Thread Coordinator steals batches alongside the Worker Pool
        while (true) {
          const b = Atomics.add(ctrl, cursorIdx, 1);
          if (b >= totalBatches) break;
          if (Atomics.compareExchange(batchState, stateBase + b, 0, 1) === 0) {
            kernel.executeBatch(taskType, b, false);
            Atomics.store(batchState, stateBase + b, 2);
            Atomics.add(ctrl, doneIdx, 1);
          }
        }

        // Wait until all claimed batches in this ring slot reach completion
        let spins = 0;
        while (Atomics.load(ctrl, doneIdx) < totalBatches) {
          if (++spins > 4096) {
            for (let b = 0; b < totalBatches; b++) {
              if (Atomics.load(batchState, stateBase + b) === 0 &&
                  Atomics.compareExchange(batchState, stateBase + b, 0, 1) === 0) {
                kernel.executeBatch(taskType, b, false);
                Atomics.store(batchState, stateBase + b, 2);
                Atomics.add(ctrl, doneIdx, 1);
              }
            }
          }
        }
      }
    }

    const WORKER_POOL = new SABWorkerPool(SHARED_ARENA);

    return {
      SUPPORTS_SAB, CTRL, CTRL_F, TASK, FLOW_CAP, MAX_CHUNKS, MAX_CELLS,
      MAX_BUCKETS, MAX_PORTALS, MAX_EDGES, MAX_CORRIDORS, MAX_CORRIDOR_STEPS,
      HASH_BATCH_SIZE, MAX_HASH_BATCHES, SEP_BATCH_SIZE, STEER_BATCH_SIZE,
      SHARED_ARENA, WORKER_POOL
    };
  })();
  //#endregion

  //#region 5: SparklineGUIExtension
  (() => {
    GUI.prototype.addSparkline = function(title, options = {}) {
      const height = options.height || 48;
      const maxPoints = options.points || 40;
      const color = options.color || '#38bdf8';
      const fill = options.fill || 'rgba(56, 189, 248, 0.15)';
      const unit = options.unit || '';

      const row = document.createElement('div');
      row.className = 'lil-sparkline-row';
      row.style.cssText = `
        padding: 6px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: rgba(15, 23, 42, 0.45);
        box-sizing: border-box;
        width: 100%;
      `;

      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #94a3b8;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = title;
      labelSpan.style.fontWeight = '600';

      const valueSpan = document.createElement('span');
      valueSpan.style.cssText = `color: ${color}; font-weight: bold; font-family: monospace; font-size: 11px;`;
      valueSpan.textContent = `-- ${unit}`;

      header.appendChild(labelSpan);
      header.appendChild(valueSpan);
      row.appendChild(header);

      const plotContainer = document.createElement('div');
      plotContainer.style.cssText = `
        width: 100%;
        height: ${height}px;
        overflow: hidden;
        position: relative;
        border-radius: 4px;
        border: 1px solid rgba(56, 189, 248, 0.15);
        background: rgba(4, 8, 18, 0.7);
      `;
      row.appendChild(plotContainer);

      (this.$children || this.domElement).appendChild(row);

      const xData = new Float64Array(maxPoints);
      const yData = new Float64Array(maxPoints).fill(0);
      for (let i = 0; i < maxPoints; i++) xData[i] = i;

      const uOpts = {
        width: 290,
        height: height,
        cursor: { show: false },
        select: { show: false },
        legend: { show: false },
        scales: {
          x: { time: false },
          y: {
            range: (u, min, max) => {
              const lo = options.min !== undefined ? options.min : Math.floor(Math.min(min, 0));
              const hi = options.max !== undefined ? options.max : Math.ceil(Math.max(max * 1.15, 1));
              return [lo, hi];
            }
          }
        },
        axes: [
          { show: false },
          {
            show: true,
            stroke: '#64748b',
            size: 32,
            font: '9px monospace',
            ticks: { show: false },
            grid: { stroke: 'rgba(56, 189, 248, 0.08)', width: 1 },
            values: (u, vals) => vals.map(v => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1))
          }
        ],
        series: [
          {},
          {
            stroke: color,
            width: 1.5,
            fill: fill
          }
        ]
      };

      let plot = null;
      try {
        plot = new UPlotClass(uOpts, [xData, yData], plotContainer);
        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
              const w = entry.contentRect.width;
              if (w > 50 && plot) plot.setSize({ width: w, height });
            }
          });
          ro.observe(plotContainer);
        }
      } catch (err) {
        console.warn('uPlot initialization fallback', err);
      }

      return {
        row,
        plot,
        push(val) {
          valueSpan.textContent = `${typeof val === 'number' ? (val >= 10 ? val.toFixed(1) : val.toFixed(2)) : val} ${unit}`;
          if (plot) {
            yData.copyWithin(0, 1);
            yData[maxPoints - 1] = val;
            plot.setData([xData, yData]);
          }
        }
      };
    };
  })();
  //#endregion

  //#region 6: PriorityQueuesAndContainers
  const { RequestQueue, MinHeap } = (() => {
    class RequestQueue {
      constructor(cap) {
        this.q = new Int32Array(cap);
        this.head = 0;
        this.tail = 0;
      }
      get length() { return this.tail - this.head; }
      push(val) { this.q[this.tail++] = val; }
      pop() { return this.head < this.tail ? this.q[this.head++] : -1; }
      clear() { this.head = this.tail = 0; }
    }

    class MinHeap {
      constructor(cap = 128) {
        this.it = new Int32Array(cap);
        this.k = new Float64Array(cap);
        this.sz = this.lastKey = 0;
      }
      get isEmpty() { return !this.sz; }
      clear() { this.sz = 0; }
      push(item, key) {
        let { it, k, sz } = this;
        if (sz === it.length) {
          const nSz = sz * 2;
          (this.it = new Int32Array(nSz)).set(it);
          (this.k = new Float64Array(nSz)).set(k);
          it = this.it; k = this.k;
        }
        let c = this.sz++, p;
        while (c > 0 && k[p = (c - 1) >> 1] > key) {
          it[c] = it[p]; k[c] = k[p]; c = p;
        }
        it[c] = item; k[c] = key;
      }
      pop() {
        let { it, k } = this, top = it[0], li = --this.sz, item = it[li], key = k[li], p = 0, ch;
        this.lastKey = k[0];
        while ((ch = p * 2 + 1) < li) {
          if (ch + 1 < li && k[ch + 1] < k[ch]) ch++;
          if (k[ch] >= key) break;
          it[p] = it[ch]; k[p] = k[ch]; p = ch;
        }
        it[p] = item; k[p] = key;
        return top;
      }
    }

    return { RequestQueue, MinHeap };
  })();
  //#endregion

  //#region 7: GridWorldDomain
  const GridWorld = (() => {
    class GridWorld {
      constructor(cx, cy) {
        this.cx = cx; this.cy = cy;
        this.width = cx * CS; this.height = cy * CS;
        this.chunkCount = cx * cy; this.version = 0;
        const { ctrl, gridCosts } = SHARED_ARENA.views;
        Atomics.store(ctrl, CTRL.GRID_W, this.width);
        Atomics.store(ctrl, CTRL.GRID_H, this.height);
        Atomics.store(ctrl, CTRL.GRID_CX, this.cx);
        Atomics.store(ctrl, CTRL.GRID_CY, this.cy);
        this.costs = gridCosts.subarray(0, this.width * this.height);
        this.costs.fill(COST_OPEN);
      }
      index(x, y) { return y * this.width + x; }
      inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
      isWalkable(x, y) { return this.inBounds(x, y) && this.costs[this.index(x, y)] < COST_BLOCK; }
      chunkIdAt(x, y) { return (y / CS | 0) * this.cx + (x / CS | 0); }
      chunkOriginX(c) { return (c % this.cx) * CS; }
      chunkOriginY(c) { return (c / this.cx | 0) * CS; }
      localIndex(cell) { return ((cell / this.width | 0) % CS) * CS + (cell % this.width % CS); }
      touchAll() {
        this.version++;
        Atomics.add(SHARED_ARENA.views.ctrl, CTRL.WORLD_VERSION, 1);
      }
      findNearestWalkable(x, y, maxR = 24) {
        const { width: W, height: H } = this, sx = clamp(x | 0, 0, W - 1), sy = clamp(y | 0, 0, H - 1);
        if (this.isWalkable(sx, sy)) return sy * W + sx;
        let bestD = Infinity, bestI = -1;
        for (let r = 1, lim = Math.min(maxR, Math.max(W, H)); r <= lim; r++) {
          const r2 = r * r;
          for (let dy = -r; dy <= r; dy++) {
            const ny = sy + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -r; dx <= r; dx++) {
              if (dx * dx < r2 && dy * dy < r2) continue;
              const nx = sx + dx;
              if (nx >= 0 && nx < W) {
                const idx = ny * W + nx, d = dx * dx + dy * dy;
                if (this.costs[idx] < COST_BLOCK && d < bestD) { bestD = d; bestI = idx; }
              }
            }
          }
          if (bestI >= 0) return bestI;
        }
        return -1;
      }
    }
    return GridWorld;
  })();
  //#endregion

  //#region 8: PortalDetectionAndGeometry
  const {
    detectPortals, portalSideCells, portalCenterCell,
    portalExitX, portalExitY, crossingCost, pLocal
  } = (() => {
    function detectPortals(grid) {
      const portals = [], { cx, cy, width } = grid;
      for (const isH of [false, true]) {
        const countX = cx - !isH, countY = cy - isH, bOffset = isH ? cy * (cx - 1) : 0;
        const W = (u, v) => grid.isWalkable(isH ? u : v, isH ? v : u);
        const at = (u, v) => isH ? v * width + u : u * width + v;
        for (let y = 0; y < countY; y++) {
          for (let x = 0; x < countX; x++) {
            const border = ((isH ? y : x) + 1) * CS, origin = (isH ? x : y) * CS;
            const cA = y * cx + x, cB = cA + (isH ? cx : 1), bIdx = bOffset + y * countX + x;
            let run = -1;
            for (let t = 0; t <= CS; t++) {
              if (t < CS && W(origin + t, border - 1) && W(origin + t, border)) {
                if (run < 0) run = t;
              } else if (run >= 0) {
                const len = t - run, start = origin + run, mid = (len - 1) >> 1, cMid = start + mid;
                const cellsA = new Int32Array(len), cellsB = new Int32Array(len);
                for (let k = 0; k < len; k++) {
                  cellsA[k] = at(start + k, border - 1);
                  cellsB[k] = at(start + k, border);
                }
                portals.push({
                  id: portals.length, uid: (bIdx * CS + run) * (CS + 1) + len,
                  isH, chunkA: cA, chunkB: cB, border, start, end: start + len - 1,
                  cellsA, cellsB, centerA: cellsA[mid], centerB: cellsB[mid],
                  anchorX: isH ? cMid + 0.5 : border, anchorY: isH ? border : cMid + 0.5
                });
                run = -1;
              }
            }
          }
        }
      }
      return portals;
    }
    const portalSideCells = (p, c) => c === p.chunkA ? p.cellsA : p.cellsB;
    const portalCenterCell = (p, c) => c === p.chunkA ? p.centerA : p.centerB;
    const portalExitX = (p, c) => p.isH ? 0 : c === p.chunkA ? 1 : -1;
    const portalExitY = (p, c) => p.isH ? c === p.chunkA ? 1 : -1 : 0;
    const crossingCost = (grid, p) => ((grid.costs[p.centerA] + grid.costs[p.centerB]) * 0.5) / COST_OPEN;
    const pLocal = (grid, p, c) => grid.localIndex(portalCenterCell(p, c));

    return {
      detectPortals, portalSideCells, portalCenterCell,
      portalExitX, portalExitY, crossingCost, pLocal
    };
  })();
  //#endregion

  //#region 9: ChunkEikonalIntegrator
  const ChunkIntegrator = (() => {
    class ChunkIntegrator {
      heap = new MinHeap(CC * 2);
      costs = new Uint8Array(CC);
      dist = new Float64Array(CC);
      integrate(grid, chunkId, sources, out) {
        const { costs, dist, heap } = this, ox = grid.chunkOriginX(chunkId), oy = grid.chunkOriginY(chunkId);
        for (let ly = 0, r = oy * grid.width + ox; ly < CS; ly++, r += grid.width) {
          costs.set(grid.costs.subarray(r, r + CS), ly * CS);
        }
        dist.fill(Infinity);
        heap.clear();
        for (let i = 0; i < sources.length; i++) {
          const cell = sources[i];
          if (costs[cell] < COST_BLOCK && dist[cell]) heap.push(cell, dist[cell] = 0);
        }
        while (!heap.isEmpty) {
          const u = heap.pop(), du = heap.lastKey;
          if (du > dist[u]) continue;
          const ux = u % CS, uy = u / CS | 0, cu = costs[u];
          for (let d = 0; d < 8; d++) {
            const nx = ux + DX[d], ny = uy + DY[d];
            if (nx >>> 0 >= CS || ny >>> 0 >= CS) continue;
            const v = ny * CS + nx, cv = costs[v];
            if (cv >= COST_BLOCK || (d >= 4 && (costs[uy * CS + nx] >= COST_BLOCK || costs[ny * CS + ux] >= COST_BLOCK))) continue;
            const moveCost = DL[d] * ((cu + cv) * 0.25);
            const nd = du + moveCost;
            if (nd < dist[v]) heap.push(v, dist[v] = nd);
          }
        }
        out.set(dist);
      }
    }
    return ChunkIntegrator;
  })();
  //#endregion

  //#region 10: PortalGraphTopology
  const PortalGraph = (() => {
    class PortalGraph {
      constructor(grid) {
        this.grid = grid;
        const portals = this.portals = detectPortals(grid), P = portals.length;
        const lists = Array.from({ length: grid.chunkCount }, () => []);
        for (let i = 0; i < P; i++) {
          const p = portals[i];
          lists[p.chunkA].push(p.id); lists[p.chunkB].push(p.id);
        }
        const chunkPortals = this.chunkPortals = lists.map(l => new Int32Array(l));
        const adj = Array.from({ length: P }, () => []), it = new ChunkIntegrator(), field = new Float64Array(CC);
        for (let c = 0; c < grid.chunkCount; c++) {
          const ids = chunkPortals[c];
          if (ids.length < 2) continue;
          for (let ia = 0; ia < ids.length; ia++) {
            const idA = ids[ia];
            it.integrate(grid, c, [pLocal(grid, portals[idA], c)], field);
            for (let ib = 0; ib < ids.length; ib++) {
              const idB = ids[ib];
              if (idA === idB) continue;
              const to = portals[idB], d = field[pLocal(grid, to, c)];
              if (d < Infinity) adj[idA].push({ to: idB, cost: d + crossingCost(grid, to), chunk: c });
            }
          }
        }
        const E = adj.flat().length;

        // Bind CSR topology directly into SharedArrayBuffer views
        const V = SHARED_ARENA.views;
        Atomics.store(V.ctrl, CTRL.PORTAL_COUNT, P);
        Atomics.store(V.ctrl, CTRL.EDGE_COUNT, E);

        let cellOffset = 0;
        V.portalCellsOffset[0] = 0;
        for (let i = 0; i < P; i++) {
          const p = portals[i];
          V.portalIsH[i] = p.isH ? 1 : 0;
          V.portalChunkA[i] = p.chunkA;
          V.portalChunkB[i] = p.chunkB;
          V.portalCenterA[i] = p.centerA;
          V.portalCenterB[i] = p.centerB;
          V.portalUid[i] = p.uid;
          V.portalAnchorX[i] = p.anchorX;
          V.portalAnchorY[i] = p.anchorY;
          const len = p.cellsA.length;
          V.portalCellsA.set(p.cellsA, cellOffset);
          V.portalCellsB.set(p.cellsB, cellOffset);
          cellOffset += len;
          V.portalCellsOffset[i + 1] = cellOffset;
        }

        let cpOff = 0;
        V.chunkPortalOffsets[0] = 0;
        for (let c = 0; c < grid.chunkCount; c++) {
          const ids = chunkPortals[c];
          V.chunkPortalIds.set(ids, cpOff);
          cpOff += ids.length;
          V.chunkPortalOffsets[c + 1] = cpOff;
        }

        for (let p = 0, e = 0; p < P; V.edgeOffsets[++p] = e) {
          for (let k = 0; k < adj[p].length; k++) {
            const edge = adj[p][k];
            V.edgeTargets[e] = edge.to; V.edgeCosts[e] = edge.cost; V.edgeChunks[e++] = edge.chunk;
          }
        }

        this.edgeOffsets = V.edgeOffsets.subarray(0, P + 1);
        this.edgeTargets = V.edgeTargets.subarray(0, E);
        this.edgeCosts = V.edgeCosts.subarray(0, E);
        this.edgeChunks = V.edgeChunks.subarray(0, E);
        SHARED_ARENA.setGraphRef(this);
      }
    }
    return PortalGraph;
  })();
  //#endregion

  //#region 11: MacroPathfinder
  const MacroPathfinder = (() => {
    class MacroPathfinder {
      constructor(grid, graph) {
        this.grid = grid; this.graph = graph;
        this.it = new ChunkIntegrator();
      }
      createGoal(cell) {
        const { grid, graph } = this, x = cell % grid.width, y = cell / grid.width | 0;
        const chunk = grid.chunkIdAt(x, y);
        const V = SHARED_ARENA.views;
        const field = V.goalField;
        this.it.integrate(grid, chunk, [grid.localIndex(cell)], field);
        const P = graph.portals.length;
        const portalCost = V.goalPortalCost.subarray(0, P);
        portalCost.fill(Infinity);
        const cPortals = graph.chunkPortals[chunk];
        for (let i = 0; i < cPortals.length; i++) {
          const pid = cPortals[i];
          const d = field[pLocal(grid, graph.portals[pid], chunk)];
          if (d < Infinity) portalCost[pid] = d;
        }
        Atomics.store(V.ctrl, CTRL.GOAL_CELL, cell);
        Atomics.store(V.ctrl, CTRL.GOAL_CHUNK, chunk);
        V.ctrlFloat[CTRL_F.GOAL_X] = x + 0.5;
        V.ctrlFloat[CTRL_F.GOAL_Y] = y + 0.5;
        SHARED_ARENA.resetGoalCorridors();
        return { cell, x, y, chunk, field, portalCost, graph };
      }
      findPath(startCell, goal) {
        if (!goal) return null;
        const cSlot = SHARED_ARENA.kernel.findMacroPathIntoSlab(startCell, false);
        return cSlot >= 0 ? SHARED_ARENA.getCorridorObject(cSlot) : null;
      }
    }
    return MacroPathfinder;
  })();
  //#endregion

  //#region 12: FlowFieldAndBilinearSampler
  const { computeFlowVectors, FlowFieldCache, sampleFlowBilinear } = (() => {
    function computeFlowVectors(f, exX, exY) {
      SHARED_ARENA.kernel.computeFlowVectorsFlat(f.integration, f.flowX, f.flowY, exX, exY);
    }

    class FlowFieldCache {
      constructor(grid, cap = FLOW_CAP) {
        this.grid = grid;
        this.cap = cap;
        const V = SHARED_ARENA.views;
        this.slotViews = Array.from({ length: FLOW_CAP }, (_, slot) => {
          const cBase = slot * CC, mBase = slot * 6;
          return {
            slot,
            get chunkId() { return V.flowMeta[mBase]; },
            get kind() { return V.flowMeta[mBase + 1] === 1 ? 'g' : 'p'; },
            get originX() { return V.flowMeta[mBase + 2]; },
            get originY() { return V.flowMeta[mBase + 3]; },
            get usageFrame() { return V.flowMeta[mBase + 4]; },
            set usageFrame(v) { V.flowMeta[mBase + 4] = v; },
            get usageCount() { return V.flowMeta[mBase + 5]; },
            set usageCount(v) { V.flowMeta[mBase + 5] = v; },
            integration: V.flowIntegration.subarray(cBase, cBase + CC),
            flowX: V.flowX.subarray(cBase, cBase + CC),
            flowY: V.flowY.subarray(cBase, cBase + CC)
          };
        });
        this.entries = {
          get size() {
            return Math.min(FLOW_CAP, Atomics.load(V.ctrl, CTRL.FLOW_ALLOC_COUNT));
          }
        };
        this.clear();
      }
      getSlotObject(slot) {
        return slot >= 0 && slot < FLOW_CAP ? this.slotViews[slot] : null;
      }
      getPortalField(c, p) {
        const slot = SHARED_ARENA.kernel.resolvePortalFieldShared(c, p.id, false);
        return this.getSlotObject(slot);
      }
      getGoalField(c, cell) {
        const slot = SHARED_ARENA.kernel.resolveGoalFieldShared(c, cell, false);
        return this.getSlotObject(slot);
      }
      clear() {
        const V = SHARED_ARENA.views;
        V.flowState.fill(0);
        V.flowKeys.fill(-1);
        Atomics.store(V.ctrl, CTRL.FLOW_ALLOC_COUNT, 0);
      }
    }

    function sampleFlowBilinear(f, px, py, out) {
      return SHARED_ARENA.kernel.sampleFlowBilinearFlat(f.slot, px, py, out);
    }

    return { computeFlowVectors, FlowFieldCache, sampleFlowBilinear };
  })();
  //#endregion

  //#region 13: ProceduralMapGenerator
  const { fillRect, fillDisc, removeDisconnectedPockets, generateMap } = (() => {
    function fillRect(grid, x, y, w, h, cost) {
      const x0 = Math.max(0, x), x1 = Math.min(grid.width, x + w);
      for (let yy = Math.max(0, y), y1 = Math.min(grid.height, y + h); yy < y1; yy++) {
        grid.costs.fill(cost, yy * grid.width + x0, yy * grid.width + x1);
      }
    }
    function fillDisc(grid, cx, cy, r, cost) {
      const r2 = r * r, x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(grid.width - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(grid.height - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) {
            const id = y * grid.width + x;
            if (cost === COST_BLOCK || grid.costs[id] === COST_OPEN) grid.costs[id] = cost;
          }
        }
      }
    }
    function removeDisconnectedPockets(grid) {
      const { width: W, costs } = grid, tot = costs.length;
      const label = new Int32Array(tot).fill(-1), queue = new Int32Array(tot);
      let best = -1, bestSz = 0, comp = 0, t = 0;
      const chk = ni => { if (label[ni] === -1 && costs[ni] < COST_BLOCK) { label[ni] = comp; queue[t++] = ni; } };
      for (let s = 0; s < tot; s++) {
        if (label[s] !== -1 || costs[s] >= COST_BLOCK) continue;
        let h = t = 0;
        queue[t++] = s; label[s] = comp;
        while (h < t) {
          const c = queue[h++], x = c % W;
          if (x > 0) chk(c - 1);
          if (x < W - 1) chk(c + 1);
          if (c >= W) chk(c - W);
          if (c + W < tot) chk(c + W);
        }
        if (t > bestSz) { bestSz = t; best = comp; }
        comp++;
      }
      for (let i = 0; i < tot; i++) if (label[i] !== -1 && label[i] !== best) costs[i] = COST_BLOCK;
    }
    function generateMap(grid, seed, { preset = 'The Grand Citadel', wallDensity = 1, mudDensity = 1 } = {}) {
      const rng = mulberry32(seed), { width: W, height: H } = grid, area = W * H;
      grid.costs.fill(COST_OPEN);
      const clr = [];
      const N = (div, d) => Math.round((area / div) * d);
      const addMud = (cnt, r0, r1) => {
        for (let k = 0; k < cnt; k++) fillDisc(grid, rng() * W, rng() * H, r0 + rng() * r1, COST_MUD);
      };
      const addHighways = cnt => {
        for (let k = 0; k < cnt; k++) {
          if (rng() < 0.5) fillRect(grid, 0, Math.floor(rng() * H), W, 2, COST_HIGHWAY);
          else fillRect(grid, Math.floor(rng() * W), 0, 2, H, COST_HIGHWAY);
        }
      };
      if (preset === 'The Grand Citadel') {
        const midX = W / 2 | 0, midY = H / 2 | 0;
        fillRect(grid, midX - 2, 0, 4, H, COST_BLOCK);
        clr.push([midX - 3, midY - 6, 6, 12]);
        clr.push([midX - 3, 4, 6, 8]);
        clr.push([midX - 3, H - 12, 6, 8]);
        fillRect(grid, 0, midY - 2, W, 4, COST_BLOCK);
        clr.push([midX - 6, midY - 3, 12, 6]);
        clr.push([12, midY - 3, 8, 6]);
        clr.push([W - 20, midY - 3, 8, 6]);
        for (let p = N(400, wallDensity); p--;) {
          fillRect(grid, Math.floor(rng() * (W - 5)), Math.floor(rng() * (H - 5)), 3 + (rng() * 4 | 0), 3 + (rng() * 4 | 0), COST_BLOCK);
        }
        fillRect(grid, 2, 2, W - 4, 2, COST_HIGHWAY);
        fillRect(grid, 2, H - 4, W - 4, 2, COST_HIGHWAY);
        addMud(N(2000, mudDensity), 3, 5);
      } else if (preset === 'The Great Maze') {
        for (let x = 4; x < W - 4; x += 6) {
          fillRect(grid, x, 0, 2, H, COST_BLOCK);
          for (let y = 0; y < H - 2; y += 6) clr.push([x - 1, y + Math.floor(rng() * 4), 4, 3]);
        }
        for (let y = 4; y < H - 4; y += 6) {
          fillRect(grid, 0, y, W, 2, COST_BLOCK);
          for (let x = 0; x < W - 2; x += 6) clr.push([x + Math.floor(rng() * 4), y - 1, 3, 4]);
        }
        addMud(N(1500, mudDensity), 2, 3);
      } else if (preset === 'Twin Hourglass Bottlenecks') {
        fillRect(grid, 0, 0, W, H, COST_OPEN);
        const w3 = (W / 3) | 0;
        fillRect(grid, w3, 0, 3, H, COST_BLOCK);
        fillRect(grid, w3 * 2, 0, 3, H, COST_BLOCK);
        clr.push([w3 - 1, (H * 0.45) | 0, 5, 8]);
        clr.push([w3 * 2 - 1, (H * 0.55) | 0, 5, 8]);
        addHighways(2);
        addMud(N(1800, mudDensity), 4, 6);
      } else if (preset === 'Highway vs Swamp') {
        fillRect(grid, (W * 0.25) | 0, 0, (W * 0.5) | 0, H, COST_MUD);
        fillRect(grid, 2, 2, W - 4, 3, COST_HIGHWAY);
        fillRect(grid, 2, H - 5, W - 4, 3, COST_HIGHWAY);
        for (let p = N(600, wallDensity); p--;) {
          fillRect(grid, Math.floor(rng() * (W - 4)), Math.floor(rng() * (H - 4)), 3, 3, COST_BLOCK);
        }
      } else {
        for (let p = N(450, wallDensity); p--;) fillDisc(grid, rng() * W, rng() * H, 2 + rng() * 3, COST_BLOCK);
        addMud(N(1400, mudDensity), 3, 6);
        addHighways(3);
      }
      for (const r of clr) fillRect(grid, ...r, COST_OPEN);
      removeDisconnectedPockets(grid);
      grid.touchAll();
    }

    return { fillRect, fillDisc, removeDisconnectedPockets, generateMap };
  })();
  //#endregion

  //#region 14: SpatialHashAndAgentPool
  const { SpatialHash, AgentPool } = (() => {
    class SpatialHash {
      constructor(w, h, cs, cap) {
        this.cs = cs;
        this.cols = Math.max(1, Math.ceil(w / cs));
        this.rows = Math.max(1, Math.ceil(h / cs));
        const B = this.cols * this.rows;
        const V = SHARED_ARENA.views;
        Atomics.store(V.ctrl, CTRL.HASH_COLS, this.cols);
        Atomics.store(V.ctrl, CTRL.HASH_ROWS, this.rows);
        Atomics.store(V.ctrl, CTRL.HASH_BUCKETS, B);
        V.ctrlFloat[CTRL_F.HASH_CS] = cs;
        this.start = V.hashStart.subarray(0, B + 1);
        this.cur = V.hashCur.subarray(0, B);
        this.items = V.hashItems;
        this.bOf = V.hashBucketOf;
      }
      bx(x) { return clamp(Math.floor(x / this.cs), 0, this.cols - 1); }
      by(y) { return clamp(Math.floor(y / this.cs), 0, this.rows - 1); }
      build(px, py, n) {
        const B = this.cols * this.rows;
        const numBatches = Math.ceil(n / HASH_BATCH_SIZE);
        Atomics.store(SHARED_ARENA.views.ctrl, CTRL.HASH_NUM_BATCHES, numBatches);

        // Pass 1: Parallel Per-Batch Histograms (Zero atomic bucket contention)
        WORKER_POOL.dispatchAndComplete(TASK.HASH_COUNT, numBatches);

        // Pass 2: Parallel Intra-Bucket Batch Offset & Total Reduction
        const numBucketBlocks = Math.ceil(B / 512);
        WORKER_POOL.dispatchAndComplete(TASK.HASH_BUCKET_REDUCE, numBucketBlocks);

        // Pass 3: Fast Sequential Global Bucket Prefix Sum
        const s = this.start;
        s[0] = 0;
        for (let b = 0; b < B; b++) s[b + 1] += s[b];

        // Pass 4: Parallel Deterministic Scatter
        WORKER_POOL.dispatchAndComplete(TASK.HASH_SCATTER, numBatches);
      }
    }

    class AgentPool {
      constructor(cap) {
        this._count = 0;
        const V = SHARED_ARENA.views;
        this.px = V.px; this.py = V.py; this.vx = V.vx; this.vy = V.vy;
        this.sepX = V.sepX; this.sepY = V.sepY; this.corrX = V.corrX; this.corrY = V.corrY;
        this.repathCd = V.repathCd;
        this.state = V.state; this.queued = V.queued; this.touching = V.touching;
        this.pathIdx = V.pathIdx; this.goalCell = V.goalCell;
        this.corridorSlot = V.corridorSlot;
        this.fieldSlot = V.fieldSlot;
        this.goalCell.fill(-1);
        this.corridorSlot.fill(-1);
        this.fieldSlot.fill(-1);

        // Proxy wrapper exposing shared corridorSlab slots as standard path objects for plugins/UI
        const pathBacking = new Array(cap).fill(null);
        this.paths = new Proxy(pathBacking, {
          get: (target, prop) => {
            if (typeof prop === 'string') {
              const idx = Number(prop);
              if (Number.isInteger(idx) && idx >= 0 && idx < cap) {
                const cSlot = this.corridorSlot[idx];
                return cSlot >= 0 ? SHARED_ARENA.getCorridorObject(cSlot) : null;
              }
            }
            return target[prop];
          },
          set: (target, prop, val) => {
            if (typeof prop === 'string') {
              const idx = Number(prop);
              if (Number.isInteger(idx) && idx >= 0 && idx < cap) {
                if (!val) this.corridorSlot[idx] = -1;
                return true;
              }
            }
            target[prop] = val;
            return true;
          }
        });

        this.fields = new Array(cap).fill(null);
      }
      get count() { return this._count; }
      set count(v) {
        this._count = v;
        Atomics.store(SHARED_ARENA.views.ctrl, CTRL.ACTIVE_AGENTS, v);
      }
      reset(i, x, y) {
        this.px[i] = x; this.py[i] = y;
        this.vx[i] = this.vy[i] = this.state[i] = this.pathIdx[i] = this.repathCd[i] = 0;
        this.goalCell[i] = -1;
        this.corridorSlot[i] = -1;
        this.fieldSlot[i] = -1;
      }
    }

    return { SpatialHash, AgentPool };
  })();
  //#endregion

  //#region 15: SimulationEngine
  const Simulation = (() => {
    class Simulation {
      constructor(opts) {
        this.agents = new AgentPool(MAX_AGENTS);
        this.agents.count = clamp(Math.round(opts.agentCount), 0, MAX_AGENTS);
        this.agentRadius = opts.agentRadius ?? 0.25;
        this.spawnPattern = opts.spawnPattern ?? 'Left Flank';
        this.maxSpeed = opts.maxSpeed ?? 20.0;
        this.steeringGain = opts.steeringGain ?? 25.0;
        this.separationStrength = opts.separationStrength ?? 28.0;
        this.pathBudgetMs = opts.pathBudgetMs ?? 20.0;
        this.simSpeed = opts.simSpeed ?? 3.0;
        this.goal = null;
        this.frame = this.arrivedAtGoal = this.respawnCounter = this.accumulator = this.autoGoalTimer = this.arrivalTimer = 0;
        this.heading = { x: 0, y: 0 };
        this.lastSimDuration = 0;
        this.tripleBuffer = SHARED_ARENA.tripleBuffer;
        this.regenerate(opts.seed, opts.chunksX, opts.chunksY, opts);
      }
      setAgentCount(cnt) {
        const prev = this.agents.count, next = this.agents.count = clamp(Math.round(cnt), 0, MAX_AGENTS);
        for (let i = prev; i < next; i++) { this.spawnAgent(i); this.goal && this.reqPath(i, false); }
        this.publishRenderState();
      }
      regenerate(seed, cx, cy, mapOpts = {}) {
        this.seed = seed;
        this.goal = null;
        generateMap(this.grid = new GridWorld(cx, cy), seed, mapOpts);
        this.rebuildGraph();
        this.respawnAll();
        this.setGoal(this.grid.width * 0.9 | 0, this.grid.height * 0.5 | 0, false);
        this.publishRenderState();
      }
      rebuildGraph() {
        const { grid } = this, pLen = (this.graph = new PortalGraph(grid)).portals.length;
        this.flowCache = new FlowFieldCache(grid);
        this.hash = new SpatialHash(grid.width, grid.height, Math.max(1.2, this.agentRadius * 3.2), MAX_AGENTS);
        this.activeFields = Array(grid.chunkCount).fill(null);
        this.activeStamp = new Int32Array(grid.chunkCount).fill(-1);
        this.pathfinder = new MacroPathfinder(grid, this.graph);
        this.portalTargets = SHARED_ARENA.views.portalTargets.subarray(0, pLen);
        this.portalOnPath = SHARED_ARENA.views.portalOnPath.subarray(0, pLen);
        if (this.goal) this.setGoal(this.goal.x, this.goal.y, false);
      }
      respawnAll() {
        this.rng = mulberry32((Math.imul(this.seed, 2654435761) + ++this.respawnCounter * 7919) >>> 0);
        this.clearQ();
        this.arrivedAtGoal = this.autoGoalTimer = this.arrivalTimer = 0;
        for (let i = 0; i < this.agents.count; i++) { this.spawnAgent(i); this.goal && this.reqPath(i, false); }
      }
      spawnAgent(i) {
        const { grid, rng, spawnPattern: sp } = this, { width: W, height: H } = grid;
        let x = 0, y = 0, ok = false;
        for (let a = 0; a < 80 && !ok; a++) {
          if (sp === 'Left Flank' || sp === 'Scatter Everywhere') {
            x = rng() * W * (sp === 'Left Flank' ? 0.2 : 1); y = rng() * H;
          } else if (sp === 'Four Corners') {
            const c = a % 4;
            x = ((c % 2) * 0.8 + 0.1 + (rng() - 0.5) * 0.14) * W;
            y = ((c >> 1) * 0.8 + 0.1 + (rng() - 0.5) * 0.14) * H;
          } else {
            x = (0.5 + (rng() - 0.5) * 0.32) * W; y = (0.5 + (rng() - 0.5) * 0.32) * H;
          }
          const cx = x | 0, cy = y | 0;
          if (grid.isWalkable(cx, cy)) { x = cx + 0.3 + rng() * 0.4; y = cy + 0.3 + rng() * 0.4; ok = true; }
        }
        if (!ok) {
          const cell = grid.findNearestWalkable(x, y, 16);
          if (cell >= 0) { x = (cell % W) + 0.5; y = (cell / W | 0) + 0.5; }
        }
        this.agents.reset(i, x, y);
      }
      setGoal(cx, cy, playAudio = true) {
        const { grid } = this, x = clamp(cx | 0, 0, grid.width - 1), y = clamp(cy | 0, 0, grid.height - 1);
        const cell = grid.isWalkable(x, y) ? grid.index(x, y) : grid.findNearestWalkable(x, y, 24);
        if (cell < 0) return false;
        this.goal = this.pathfinder.createGoal(cell);
        this.clearQ();
        this.autoGoalTimer = this.arrivalTimer = 0;
        if (playAudio) audio.playGoal();
        for (let i = 0; i < this.agents.count; i++) this.reqPath(i, false);
        return true;
      }
      pickRandomGoal() {
        const { grid, goal } = this, { width: W, height: H } = grid;
        const px = goal ? goal.x : W / 2, py = goal ? goal.y : H / 2, minDist = Math.min(W, H) * 0.38;
        for (let a = 0; a < 120; a++) {
          const rx = Math.random() * W | 0, ry = Math.random() * H | 0;
          if (grid.isWalkable(rx, ry) && (Math.hypot(rx - px, ry - py) >= minDist || a > 70)) return this.setGoal(rx, ry, true);
        }
        return false;
      }
      clearQ() {
        const { ctrl } = SHARED_ARENA.views;
        Atomics.store(ctrl, CTRL.URGENT_HEAD, 0);
        Atomics.store(ctrl, CTRL.URGENT_TAIL, 0);
        Atomics.store(ctrl, CTRL.BULK_HEAD, 0);
        Atomics.store(ctrl, CTRL.BULK_TAIL, 0);
        this.agents.queued.fill(0);
      }
      reqPath(i, urgent) {
        const A = this.agents;
        if (urgent && A.repathCd[i] > 0) return;
        if (Atomics.compareExchange(A.queued, i, 0, 1) !== 0) return;
        const { ctrl, urgentQBuf, bulkQBuf } = SHARED_ARENA.views;
        if (urgent) {
          A.repathCd[i] = 0.35;
          const t = Atomics.add(ctrl, CTRL.URGENT_TAIL, 1);
          urgentQBuf[t % urgentQBuf.length] = i;
        } else {
          const t = Atomics.add(ctrl, CTRL.BULK_TAIL, 1);
          bulkQBuf[t % bulkQBuf.length] = i;
        }
      }
      processRequests() {
        const { ctrl } = SHARED_ARENA.views;
        const uLen = Atomics.load(ctrl, CTRL.URGENT_TAIL) - Atomics.load(ctrl, CTRL.URGENT_HEAD);
        if (uLen > 0) {
          const uBatches = Math.min(32, Math.ceil(uLen / 16));
          WORKER_POOL.dispatchAndComplete(TASK.PATHFIND_URGENT, uBatches);
        }
        if (Atomics.load(ctrl, CTRL.URGENT_HEAD) >= Atomics.load(ctrl, CTRL.URGENT_TAIL)) {
          Atomics.store(ctrl, CTRL.URGENT_HEAD, 0);
          Atomics.store(ctrl, CTRL.URGENT_TAIL, 0);
        }

        const t0 = performance.now();
        while (true) {
          const bLen = Atomics.load(ctrl, CTRL.BULK_TAIL) - Atomics.load(ctrl, CTRL.BULK_HEAD);
          if (bLen <= 0) {
            Atomics.store(ctrl, CTRL.BULK_HEAD, 0);
            Atomics.store(ctrl, CTRL.BULK_TAIL, 0);
            break;
          }
          const chunkBatches = Math.min(64, Math.ceil(bLen / 16));
          WORKER_POOL.dispatchAndComplete(TASK.PATHFIND_BULK, chunkBatches);
          if (performance.now() - t0 >= this.pathBudgetMs) break;
        }
      }
      update(dt) {
        const t0 = performance.now();
        WORKER_POOL.beginFrameSpin();
        this.processRequests();
        this.accumulator += Math.min(dt * this.simSpeed, 0.2);
        let stepped = false;
        for (let s = 0; this.accumulator >= FIXED_DT && s < 2; s++) {
          this.step(FIXED_DT);
          this.accumulator -= FIXED_DT;
          stepped = true;
        }
        if (this.accumulator >= FIXED_DT) this.accumulator = 0;
        if (stepped) this.publishRenderState();
        WORKER_POOL.endFrameSpin();
        this.lastSimDuration = performance.now() - t0;
      }
      publishRenderState() {
        const V = SHARED_ARENA.views;
        this.tripleBuffer.publishWorkerFrame(
          V.px, V.py, V.vx, V.vy, V.state,
          V.renderPx, V.renderPy, V.renderVx, V.renderVy, V.renderState,
          this.agents.count
        );
      }
      step(h) {
        this.frame++;
        const { frame, agents: A, grid, hash } = this, n = A.count;
        const V = SHARED_ARENA.views;
        const { ctrl, ctrlFloat, chunkBestSlot, chunkBestCount } = V;

        const rad = this.agentRadius, sepRad = rad * 3;
        const crowdR = Math.sqrt((this.arrivedAtGoal * sepRad * sepRad * 0.866) / Math.PI) + 0.5;
        const contagR = Math.max(3, crowdR * 1.6), leaveR = crowdR * 2 + 4;

        Atomics.store(ctrl, CTRL.FRAME_NUM, frame);
        Atomics.store(ctrl, CTRL.ARRIVED_COUNT, 0);
        ctrlFloat[CTRL_F.DT] = h;
        ctrlFloat[CTRL_F.AGENT_RADIUS] = rad;
        ctrlFloat[CTRL_F.MAX_SPEED] = this.maxSpeed;
        ctrlFloat[CTRL_F.STEERING_GAIN] = this.steeringGain;
        ctrlFloat[CTRL_F.SEP_STRENGTH] = this.separationStrength;
        ctrlFloat[CTRL_F.CONTAG_R] = contagR;
        ctrlFloat[CTRL_F.LEAVE_R] = leaveR;

        // 1. Contention-Free Parallel Spatial Hash Build
        hash.build(A.px, A.py, n);

        // 2. Dynamic Work-Stealing Neighbor Separation
        const sepBatches = Math.ceil(n / SEP_BATCH_SIZE);
        WORKER_POOL.dispatchAndComplete(TASK.SEPARATION, sepBatches);

        // 3. Reset per-step telemetry & chunk usage accumulators
        this.portalTargets.fill(0);
        this.portalOnPath.fill(0);
        chunkBestSlot.fill(-1, 0, grid.chunkCount);
        chunkBestCount.fill(0, 0, grid.chunkCount);

        // 4. Dynamic Work-Stealing Flow Resolution, Bilinear Sampling, Steering & Wall Collision
        const steerBatches = Math.ceil(n / STEER_BATCH_SIZE);
        WORKER_POOL.dispatchAndComplete(TASK.STEER_COLLIDE, steerBatches);

        // 5. Sync active chunk flow fields for visual plugins
        for (let c = 0; c < grid.chunkCount; c++) {
          const bestSlot = chunkBestSlot[c];
          if (bestSlot >= 0) {
            this.activeStamp[c] = frame;
            this.activeFields[c] = this.flowCache.getSlotObject(bestSlot);
          }
        }

        const arrCnt = Atomics.load(ctrl, CTRL.ARRIVED_COUNT);
        if (this.arrivedAtGoal === 0 && arrCnt > 0) audio.playArrival();
        this.arrivedAtGoal = arrCnt;

        if (CONFIG.autoGoal.enabled && this.goal && n > 0) {
          this.autoGoalTimer += h;
          this.arrivalTimer = (this.arrivedAtGoal / n >= CONFIG.autoGoal.arrivalPct) ? this.arrivalTimer + h : 0;
          const m = CONFIG.autoGoal.mode;
          const hitArrival = (m === 'On Arrival' || m === 'Either') && this.arrivalTimer >= CONFIG.autoGoal.delay;
          const hitTimer = (m === 'Timer' || m === 'Either') && this.autoGoalTimer >= CONFIG.autoGoal.interval;
          if (hitArrival || hitTimer) this.pickRandomGoal();
        }
      }
    }
    return Simulation;
  })();
  //#endregion

  //#region 16: ThemeAndColorLUTs
  const { THEME_RAW, THEME, HEATMAP_LUT, TINTS } = (() => {
    const THEME_RAW = {
      bg: '#040711', gA: '#090f1d', gB: '#0d1527',
      wall: '#1e293b', wallTop: '#334155',
      highway: '#0284c7', highwayLine: '#38bdf8',
      mud: '#3b2d13', mudSpeck: '#714e1a',
      chunkLine: 'rgba(56,189,248,0.18)',
      actFill: 'rgba(56,189,248,0.04)', actStr: 'rgba(56,189,248,0.35)',
      arrP: 'rgba(125,211,252,0.85)', arrG: 'rgba(244,114,182,0.9)',
      pIdle: 'rgba(250,204,21,0.3)', pPath: 'rgba(250,204,21,0.85)', pHot: '#fef08a',
      pGlow: 'rgba(253,224,71,0.25)', corridor: 'rgba(240,171,252,0.6)', aPath: '#f0abfc',
      goal: '#f472b6', moving: '#22d3ee', arrived: '#4ade80', noPath: '#f87171',
      idle: '#94a3b8', graphEdge: 'rgba(250,204,21,0.22)'
    };
    const THEME = Object.fromEntries(Object.entries(THEME_RAW).map(([k, css]) => {
      const c = new PIXI.Color(css); return [k, { num: c.toNumber(), alpha: c.alpha, css }];
    }));
    const HEATMAP_LUT = Array.from({ length: 64 }, (_, i) => {
      const c = new PIXI.Color({ h: 240 - (i * 20 / 7), s: 85, l: 52 });
      const [r, g, b] = c.toRgbArray();
      return { num: c.toNumber(), r: (r * 255) | 0, g: (g * 255) | 0, b: (b * 255) | 0 };
    });
    const TINTS = [0x94a3b8, 0x22d3ee, 0x4ade80, 0xf87171];
    return { THEME_RAW, THEME, HEATMAP_LUT, TINTS };
  })();
  //#endregion

  //#region 17: VisualPluginSystem
  const { VisualPlugin, VisualPluginManager } = (() => {
    class VisualPlugin {
      constructor(id, name, defaultEnabled = false, phase = 'beforeAgents') {
        this.id = id;
        this.name = name;
        this.phase = phase; // 'beforeAgents' | 'afterAgents' | 'post'
        this._enabled = defaultEnabled;
      }
      get enabled() {
        return this._enabled;
      }
      set enabled(val) {
        const b = !!val;
        if (this._enabled === b) return;
        this._enabled = b;
        if (b) this.onEnable?.();
        else this.onDisable?.();
      }
      enable() { this.enabled = true; }
      disable() { this.enabled = false; }
      toggle() { this.enabled = !this.enabled; }
      init(context) {}
      render(context) {}
      onEnable() {}
      onDisable() {}
      onWorldResized(context) {}
    }

    class VisualPluginManager {
      constructor(renderer) {
        this.renderer = renderer;
        this.plugins = new Map();
      }
      register(plugin) {
        this.plugins.set(plugin.id, plugin);
        plugin.init?.({ renderer: this.renderer, world: this.renderer.world, app: this.renderer.app });
        return plugin;
      }
      get(id) {
        return this.plugins.get(id);
      }
      renderPhase(phase, ctx) {
        for (const plugin of this.plugins.values()) {
          if (plugin.enabled && plugin.phase === phase) {
            plugin.render(ctx);
          }
        }
      }
      onWorldResized(grid) {
        for (const plugin of this.plugins.values()) {
          plugin.onWorldResized?.({ renderer: this.renderer, grid });
        }
      }
      attachGUI(folder) {
        for (const plugin of this.plugins.values()) {
          folder.add(plugin, 'enabled').name(plugin.name);
        }
      }
    }

    return { VisualPlugin, VisualPluginManager };
  })();
  //#endregion

  //#region 18: ConcreteVisualPlugins
  const {
    FlowFieldsPlugin, DistanceHeatmapPlugin, PortalsPlugin, GraphEdgesPlugin,
    ChunkBordersPlugin, SelectedPathPlugin, VelocityTicksPlugin, MinimapPlugin
  } = (() => {
    class FlowFieldsPlugin extends VisualPlugin {
      constructor() {
        super('flowFields', 'Flow Vectors', false, 'beforeAgents');
        this.container = null;
        this.bgG = null;
        this.pG = null;
        this.gG = null;
      }
      init({ world }) {
        this.container = new PIXI.Container();
        this.container.zIndex = 40;
        this.bgG = new PIXI.Graphics();
        this.pG = new PIXI.Graphics();
        this.gG = new PIXI.Graphics();
        this.container.addChild(this.bgG, this.pG, this.gG);
        this.container.visible = false;
        world.addChild(this.container);
      }
      onDisable() {
        if (this.container) {
          this.bgG.clear();
          this.pG.clear();
          this.gG.clear();
          this.container.visible = false;
        }
      }
      render({ sim, renderer }) {
        const { bgG, pG, gG } = this;
        const cp = renderer.cellPx;
        bgG.clear(); pG.clear(); gG.clear();
        bgG.visible = false; pG.visible = false; gG.visible = false;
        const half = 0.35, head = 0.22, cos = 0.89879, sin = 0.43837, stride = cp < 6 ? 4 : cp < 12 ? 2 : 1;
        let hasP = false, hasG = false, hasBox = false;
        const cMinX = renderer.camera.x - (renderer.cssWidth / 2) / cp - CS;
        const cMaxX = renderer.camera.x + (renderer.cssWidth / 2) / cp + CS;
        const cMinY = renderer.camera.y - (renderer.cssHeight / 2) / cp - CS;
        const cMaxY = renderer.camera.y + (renderer.cssHeight / 2) / cp + CS;
        for (let c = 0; c < sim.grid.chunkCount; c++) {
          if (sim.activeStamp[c] !== sim.frame || !sim.activeFields[c]) continue;
          const f = sim.activeFields[c], { originX: x, originY: y } = f;
          if (x + CS < cMinX || x > cMaxX || y + CS < cMinY || y > cMaxY) continue;
          bgG.rect(x, y, CS, CS).fill({ color: THEME.actFill.num, alpha: THEME.actFill.alpha })
             .rect(x + 0.05, y + 0.05, CS - 0.1, CS - 0.1).stroke({ color: THEME.actStr.num, width: 1 / cp, alpha: THEME.actStr.alpha });
          hasBox = true;
          const isGoal = f.kind === 'g', targetG = isGoal ? gG : pG;
          isGoal ? (hasG = true) : (hasP = true);
          for (let ly = 0; ly < CS; ly += stride) {
            for (let lx = 0; lx < CS; lx += stride) {
              const i = ly * CS + lx, fx = f.flowX[i], fy = f.flowY[i];
              if (!fx && !fy) continue;
              const cx = x + lx + 0.5, cy = y + ly + 0.5, tx = cx + fx * half, ty = cy + fy * half, bx = -fx, by = -fy;
              targetG.moveTo(cx - fx * half, cy - fy * half).lineTo(tx, ty);
              if (stride === 1) {
                targetG.moveTo(tx + (bx * cos - by * sin) * head, ty + (bx * sin + by * cos) * head)
                       .lineTo(tx).lineTo(tx + (bx * cos + by * sin) * head, ty + (-bx * sin + by * cos) * head);
              }
            }
          }
        }
        const aW = Math.max(1, cp * 0.08) / cp;
        const strokeArr = (g, th, has) => (g.visible = has) && g.stroke({ color: th.num, width: aW, alpha: th.alpha, cap: 'round', join: 'round' });
        strokeArr(pG, THEME.arrP, hasP);
        strokeArr(gG, THEME.arrG, hasG);
        bgG.visible = hasBox;
        this.container.visible = hasBox || hasP || hasG;
      }
    }

    class DistanceHeatmapPlugin extends VisualPlugin {
      constructor() {
        super('distanceHeatmap', 'Distance Heatmap', false, 'beforeAgents');
        this.heatCanvas = createOffscreen(16, 16);
        this.heatTexture = null;
        this.heatSprite = null;
        this.heatCtx = null;
        this.heatImg = null;
      }
      init({ world }) {
        this.heatSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.heatSprite.zIndex = 10;
        this.heatSprite.visible = false;
        world.addChild(this.heatSprite);
      }
      onWorldResized() {
        if (this.heatTexture) {
          this.heatTexture.destroy(true);
          this.heatTexture = null;
        }
      }
      onDisable() {
        if (this.heatSprite) this.heatSprite.visible = false;
      }
      render({ sim }) {
        const { grid } = sim, { width: W, height: H } = grid;
        if (this.heatCanvas.width !== W || this.heatCanvas.height !== H) {
          this.heatCanvas.width = W; this.heatCanvas.height = H;
          this.heatCtx = this.heatCanvas.getContext('2d');
          this.heatImg = this.heatCtx.createImageData(W, H);
          if (this.heatTexture) {
            this.heatTexture.destroy(true);
            this.heatTexture = null;
          }
        }
        const img = this.heatImg, data = img.data;
        data.fill(0);
        let drawn = false;
        for (let c = 0; c < grid.chunkCount; c++) {
          if (sim.activeStamp[c] !== sim.frame || !sim.activeFields[c]) continue;
          const f = sim.activeFields[c], ox = f.originX, oy = f.originY;
          for (let ly = 0; ly < CS; ly++) {
            const row = (oy + ly) * W;
            for (let lx = 0; lx < CS; lx++) {
              const d = f.integration[ly * CS + lx];
              if (d < Infinity && d > 0) {
                const idx = (row + ox + lx) * 4;
                const lut = HEATMAP_LUT[Math.min(63, d * 63 / 40 | 0)];
                data[idx] = lut.r; data[idx + 1] = lut.g; data[idx + 2] = lut.b; data[idx + 3] = 95;
                drawn = true;
              }
            }
          }
        }
        if (drawn) {
          this.heatCtx.putImageData(img, 0, 0);
          if (!this.heatTexture) {
            this.heatTexture = PIXI.Texture.from(this.heatCanvas);
            this.heatTexture.source.scaleMode = 'nearest';
            this.heatSprite.texture = this.heatTexture;
          } else {
            this.heatTexture.source.update();
          }
          this.heatSprite.width = W; this.heatSprite.height = H;
          this.heatSprite.visible = true;
        } else {
          this.heatSprite.visible = false;
        }
      }
    }

    class PortalsPlugin extends VisualPlugin {
      constructor() {
        super('portals', 'Portal Boundaries', false, 'beforeAgents');
        this.graphics = null;
      }
      init({ world }) {
        this.graphics = new PIXI.Graphics();
        this.graphics.zIndex = 50;
        this.graphics.visible = false;
        world.addChild(this.graphics);
      }
      onDisable() {
        if (this.graphics) {
          this.graphics.clear();
          this.graphics.visible = false;
        }
      }
      render({ sim, renderer }) {
        const g = this.graphics, idle = [], path = [], hot = [], cp = renderer.cellPx;
        g.clear();
        for (let i = 0; i < sim.graph.portals.length; i++) {
          const { isH: h, start: s, border: b, end: e, id } = sim.graph.portals[i];
          (sim.portalTargets[id] > 0 ? hot : sim.portalOnPath[id] ? path : idle).push(h ? s : b, h ? b : s, h ? e + 1 : b, h ? b : e + 1);
        }
        const draw = (arr, c, w) => {
          if (!arr.length) return;
          for (let i = 0; i < arr.length; i += 4) g.moveTo(arr[i], arr[i + 1]).lineTo(arr[i + 2], arr[i + 3]);
          g.stroke({ color: c.num, width: w / cp, alpha: c.alpha, cap: 'square' });
        };
        draw(idle, THEME.pIdle, Math.max(2, cp * 0.22));
        draw(path, THEME.pPath, Math.max(2.5, cp * 0.3));
        draw(hot, THEME.pGlow, Math.max(6, cp * 0.95));
        draw(hot, THEME.pHot, Math.max(3, cp * 0.36));
        g.visible = !!(idle.length || path.length || hot.length);
      }
    }

    class GraphEdgesPlugin extends VisualPlugin {
      constructor() {
        super('graphEdges', 'Macro Graph Edges', false, 'beforeAgents');
        this.graphics = null;
      }
      init({ world }) {
        this.graphics = new PIXI.Graphics();
        this.graphics.zIndex = 30;
        this.graphics.visible = false;
        world.addChild(this.graphics);
      }
      onDisable() {
        if (this.graphics) {
          this.graphics.clear();
          this.graphics.visible = false;
        }
      }
      render({ sim, renderer }) {
        const g = this.graphics, { portals, edgeOffsets, edgeTargets } = sim.graph;
        g.clear();
        let cnt = 0;
        for (let u = 0; u < portals.length; u++) {
          const p = portals[u];
          for (let e = edgeOffsets[u]; e < edgeOffsets[u + 1]; e++) {
            const v = edgeTargets[e];
            if (v > u) { g.moveTo(p.anchorX, p.anchorY).lineTo(portals[v].anchorX, portals[v].anchorY); cnt++; }
          }
        }
        if (cnt > 0) {
          g.visible = true;
          g.stroke({ color: THEME.graphEdge.num, width: 1.5 / renderer.cellPx, alpha: THEME.graphEdge.alpha });
        } else {
          g.visible = false;
        }
      }
    }

    class ChunkBordersPlugin extends VisualPlugin {
      constructor() {
        super('chunkBorders', 'Chunk Borders', false, 'beforeAgents');
        this.graphics = null;
      }
      init({ world }) {
        this.graphics = new PIXI.Graphics();
        this.graphics.zIndex = 20;
        this.graphics.visible = false;
        world.addChild(this.graphics);
      }
      onDisable() {
        if (this.graphics) {
          this.graphics.clear();
          this.graphics.visible = false;
        }
      }
      render({ sim, renderer }) {
        const g = this.graphics;
        const { cx, cy, width, height } = sim.grid;
        const cp = renderer.cellPx;
        g.clear();
        for (let x = 1; x < cx; x++) {
          g.moveTo(x * CS, 0).lineTo(x * CS, height);
        }
        for (let y = 1; y < cy; y++) {
          g.moveTo(0, y * CS).lineTo(width, y * CS);
        }
        g.stroke({ color: THEME.chunkLine.num, width: 1.5 / cp, alpha: THEME.chunkLine.alpha });
        g.visible = true;
      }
    }

    class SelectedPathPlugin extends VisualPlugin {
      constructor() {
        super('selectedPath', 'Selected Corridor', false, 'beforeAgents');
        this.graphics = null;
      }
      init({ world }) {
        this.graphics = new PIXI.Graphics();
        this.graphics.zIndex = 60;
        this.graphics.visible = false;
        world.addChild(this.graphics);
      }
      onDisable() {
        if (this.graphics) {
          this.graphics.clear();
          this.graphics.visible = false;
        }
      }
      render({ sim, renderer, primarySel }) {
        const g = this.graphics, A = sim.agents, cp = renderer.cellPx;
        if (primarySel < 0 || primarySel >= A.count || !A.paths[primarySel] || A.paths[primarySel].graph !== sim.graph) {
          g.clear();
          g.visible = false;
          return;
        }
        g.clear();
        g.visible = true;
        const path = A.paths[primarySel], idx = Math.min(A.pathIdx[primarySel], path.chunks.length - 1), { grid, graph } = sim;
        for (let k = idx; k < path.chunks.length; k++) {
          const c = path.chunks[k];
          g.rect(grid.chunkOriginX(c) + 0.1, grid.chunkOriginY(c) + 0.1, CS - 0.2, CS - 0.2)
           .stroke({ color: THEME.corridor.num, width: 2 / cp, alpha: THEME.corridor.alpha });
        }
        g.moveTo(A.px[primarySel], A.py[primarySel]);
        const pts = path.portals.slice(idx).map(p => graph.portals[p]);
        for (let i = 0; i < pts.length; i++) g.lineTo(pts[i].anchorX, pts[i].anchorY);
        g.lineTo(path.goalX, path.goalY).stroke({ color: THEME.aPath.num, width: 2.5 / cp, cap: 'round', join: 'round' });
        for (let i = 0; i < pts.length; i++) g.circle(pts[i].anchorX, pts[i].anchorY, Math.max(3, cp * 0.35) / cp);
        if (pts.length) g.fill({ color: THEME.aPath.num });
      }
    }

    class VelocityTicksPlugin extends VisualPlugin {
      constructor() {
        super('velocityTicks', 'Heading Ticks', false, 'afterAgents');
        this.graphics = null;
      }
      init({ world }) {
        this.graphics = new PIXI.Graphics();
        this.graphics.zIndex = 80;
        this.graphics.visible = false;
        world.addChild(this.graphics);
      }
      onDisable() {
        if (this.graphics) {
          this.graphics.clear();
          this.graphics.visible = false;
        }
      }
      render({ sim, renderer }) {
        const g = this.graphics;
        const cp = renderer.cellPx;
        if (cp < 7) {
          g.clear();
          g.visible = false;
          return;
        }
        g.clear();
        const A = sim.agents, n = A.count;
        const cMinX = renderer.camera.x - (renderer.cssWidth / 2) / cp - 2;
        const cMaxX = renderer.camera.x + (renderer.cssWidth / 2) / cp + 2;
        const cMinY = renderer.camera.y - (renderer.cssHeight / 2) / cp - 2;
        const cMaxY = renderer.camera.y + (renderer.cssHeight / 2) / cp + 2;
        let tCnt = 0;
        for (let i = 0; i < n; i++) {
          if (A.state[i] !== 1) continue;
          const x = A.px[i], y = A.py[i];
          if (x < cMinX || x > cMaxX || y < cMinY || y > cMaxY) continue;
          const spd = Math.hypot(A.vx[i], A.vy[i]);
          if (spd > 0.3) {
            const s = sim.agentRadius * 1.8 / spd;
            g.moveTo(x, y).lineTo(x + A.vx[i] * s, y + A.vy[i] * s);
            tCnt++;
            if (tCnt >= 3000) break;
          }
        }
        if (tCnt > 0) {
          g.visible = true;
          g.stroke({ color: 0x082f49, width: 1.5 / cp, cap: 'round', alpha: 0.95 });
        } else {
          g.visible = false;
        }
      }
    }

    class MinimapPlugin extends VisualPlugin {
      constructor(minimapInstance, cardElement) {
        super('minimap', 'Tactical Radar', true, 'post');
        this.minimap = minimapInstance;
        this.card = cardElement;
      }
      init() {
        if (this.card) this.card.style.display = this.enabled ? 'flex' : 'none';
      }
      onEnable() {
        if (this.card) this.card.style.display = 'flex';
      }
      onDisable() {
        if (this.card) this.card.style.display = 'none';
      }
      onWorldResized() {
        if (this.minimap) this.minimap.bgVersion = -1;
      }
      render({ sim, renderer }) {
        if (this.minimap) {
          this.minimap.render(sim, renderer);
        }
      }
    }

    return {
      FlowFieldsPlugin, DistanceHeatmapPlugin, PortalsPlugin, GraphEdgesPlugin,
      ChunkBordersPlugin, SelectedPathPlugin, VelocityTicksPlugin, MinimapPlugin
    };
  })();
  //#endregion

  //#region 19: PixiWorldRenderer
  const Renderer = (() => {
    class Renderer {
      constructor(app) {
        this.app = app;
        this.cssWidth = this.cssHeight = this.screenX = this.screenY = this.lastActiveCount = 0;
        this.cellPx = this.baseCellPx = 1;
        this.mapVersion = -1;
        this.mapGrid = null;
        this.mapCanvas = createOffscreen(16, 16);
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.followSelected = false;
        this.selectedAgents = new Set([0]);
        this.boxSelectRect = null;

        this.world = new PIXI.Container();
        this.world.sortableChildren = true;
        app.stage.addChild(this.world);

        this.mapSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.mapSprite.zIndex = 0;
        this.world.addChild(this.mapSprite);

        this.pluginManager = new VisualPluginManager(this);

        this.pluginManager.register(new FlowFieldsPlugin());
        this.pluginManager.register(new DistanceHeatmapPlugin());
        this.pluginManager.register(new PortalsPlugin());
        this.pluginManager.register(new GraphEdgesPlugin());
        this.pluginManager.register(new ChunkBordersPlugin());
        this.pluginManager.register(new SelectedPathPlugin());

        this.agentContainer = new PIXI.Container();
        this.agentContainer.sortableChildren = false;
        this.agentContainer.zIndex = 70;
        this.world.addChild(this.agentContainer);

        this.pluginManager.register(new VelocityTicksPlugin());

        const G = () => new PIXI.Graphics();
        this.selectionG = G();
        this.selectionG.zIndex = 90;
        this.boxSelectG = G();
        this.boxSelectG.zIndex = 100;
        this.goalG = G();
        this.goalG.zIndex = 110;
        this.hoverG = G();
        this.hoverG.zIndex = 120;

        this.world.addChild(this.selectionG, this.boxSelectG, this.goalG, this.hoverG);

        const c = createOffscreen(32, 32), ctx = c.getContext('2d');
        ctx.arc(16, 16, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
        const tex = PIXI.Texture.from(c);
        this.agentSprites = Array.from({ length: MAX_AGENTS }, () => {
          const sp = new PIXI.Sprite(tex);
          sp.anchor.set(0.5); sp.visible = false;
          sp._tintNum = -1;
          return this.agentContainer.addChild(sp);
        });
        this.updateAgentBaseScale(0.25);
      }
      updateAgentBaseScale(rad) {
        const sz = rad * 2.2;
        const s = sz / 32;
        for (let i = 0; i < MAX_AGENTS; i++) this.agentSprites[i].scale.set(s);
      }
      hide(...gs) { for (const g of gs) { g.clear?.(); g.visible = false; } }
      resetCamera(grid) { this.camera = { x: grid.width / 2, y: grid.height / 2, zoom: 1 }; }
      resize(w, h) { this.cssWidth = Math.max(1, w); this.cssHeight = Math.max(1, h); }
      panBy(dx, dy) { this.camera.x -= dx / this.cellPx; this.camera.y -= dy / this.cellPx; }
      screenToWorld(sx, sy) { return { x: (sx - this.screenX) / this.cellPx, y: (sy - this.screenY) / this.cellPx }; }
      zoomAt(sx, sy, f) {
        const b = this.screenToWorld(sx, sy), p = (this.baseCellPx * (this.camera.zoom = clamp(this.camera.zoom * f, 0.25, 14)));
        this.camera.x = b.x - (sx - this.cssWidth / 2) / p;
        this.camera.y = b.y - (sy - this.cssHeight / 2) / p;
      }
      onWorldResized(grid) {
        this.resetCamera(grid);
        this.mapVersion = -1;
        this.mapGrid = null;
        if (this.mapTexture) {
          this.mapTexture.destroy(true);
          this.mapTexture = null;
        }
        this.pluginManager.onWorldResized(grid);
      }
      render(sim, primarySel, hover, time) {
        const { grid } = sim;
        const rSlot = sim.tripleBuffer.acquireRenderFrame();
        const rBase = rSlot * MAX_AGENTS;
        const { renderPx, renderPy, renderState } = SHARED_ARENA.views;

        if (this.followSelected && primarySel >= 0 && primarySel < sim.agents.count) {
          this.camera.x += (renderPx[rBase + primarySel] - this.camera.x) * 0.15;
          this.camera.y += (renderPy[rBase + primarySel] - this.camera.y) * 0.15;
        }
        this.cellPx = (this.baseCellPx = Math.min(this.cssWidth / grid.width, this.cssHeight / grid.height) * 0.94) * this.camera.zoom;
        this.world.position.set(this.screenX = this.cssWidth / 2 - this.camera.x * this.cellPx, this.screenY = this.cssHeight / 2 - this.camera.y * this.cellPx);
        this.world.scale.set(this.cellPx);

        if (this.mapGrid !== grid || this.mapVersion !== grid.version) this.rebuildMapLayer(grid);
        this.mapSprite.width = grid.width; this.mapSprite.height = grid.height;

        const renderCtx = { sim, renderer: this, primarySel, hover, time, cellPx: this.cellPx };

        this.pluginManager.renderPhase('beforeAgents', renderCtx);

        this.agentContainer.visible = true;
        this.drawAgents(sim, primarySel, rBase, renderPx, renderPy, renderState);

        this.pluginManager.renderPhase('afterAgents', renderCtx);

        this.drawGoal(sim, time);
        this.drawHover(sim, hover);
        this.drawBoxSelect();

        this.app.renderer.render({ container: this.app.stage });

        this.pluginManager.renderPhase('post', renderCtx);
      }
      rebuildMapLayer(grid) {
        this.mapGrid = grid; this.mapVersion = grid.version;
        const layer = this.mapCanvas, { width: W, height: H, cx, cy, costs } = grid, TP = 8, CTP = CS * TP;
        layer.width = W * TP; layer.height = H * TP;
        const ctx = layer.getContext('2d');
        for (let y = 0; y < cy; y++) {
          for (let x = 0; x < cx; x++) {
            ctx.fillStyle = (x + y) % 2 ? THEME.gB.css : THEME.gA.css;
            ctx.fillRect(x * CTP, y * CTP, CTP, CTP);
          }
        }
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const c = costs[y * W + x], px = x * TP, py = y * TP;
            if (c >= COST_BLOCK) {
              ctx.fillStyle = THEME.wall.css; ctx.fillRect(px, py, TP, TP);
              if (!y || costs[(y - 1) * W + x] < COST_BLOCK) {
                ctx.fillStyle = THEME.wallTop.css; ctx.fillRect(px, py, TP, 2);
              }
            } else if (c === COST_HIGHWAY) {
              ctx.fillStyle = THEME.highway.css; ctx.fillRect(px, py, TP, TP);
              ctx.fillStyle = THEME.highwayLine.css; ctx.fillRect(px + 2, py + 2, TP - 4, TP - 4);
            } else if (c === COST_MUD) {
              ctx.fillStyle = THEME.mud.css; ctx.fillRect(px, py, TP, TP);
              if (!((x * 7 + y * 13) & 3)) {
                ctx.fillStyle = THEME.mudSpeck.css; ctx.fillRect(px + 2, py + 4, 2, 2);
              }
            }
          }
        }
        if (this.mapTexture) {
          this.mapTexture.destroy(true);
        }
        this.mapTexture = PIXI.Texture.from(layer);
        this.mapTexture.source.scaleMode = 'nearest';
        this.mapSprite.texture = this.mapTexture;
        this.mapSprite.width = grid.width;
        this.mapSprite.height = grid.height;
      }
      drawAgents(sim, sel, rBase, rPx, rPy, rState) {
        const n = sim.agents.count, cp = this.cellPx;
        const cMinX = this.camera.x - (this.cssWidth / 2) / cp - 2;
        const cMaxX = this.camera.x + (this.cssWidth / 2) / cp + 2;
        const cMinY = this.camera.y - (this.cssHeight / 2) / cp - 2;
        const cMaxY = this.camera.y + (this.cssHeight / 2) / cp + 2;
        for (let i = 0; i < n; i++) {
          const idx = rBase + i;
          const sp = this.agentSprites[i], x = rPx[idx], y = rPy[idx];
          if (x < cMinX || x > cMaxX || y < cMinY || y > cMaxY) {
            if (sp.visible) sp.visible = false;
            continue;
          }
          const st = rState[idx];
          sp.visible = true; sp.x = x; sp.y = y;
          const targetCol = TINTS[st] || 0x94a3b8;
          if (sp._tintNum !== targetCol) { sp.tint = sp._tintNum = targetCol; }
        }
        for (let i = n; i < this.lastActiveCount; i++) this.agentSprites[i].visible = false;
        this.lastActiveCount = n;
        this.selectionG.clear();
        if (this.selectedAgents.size > 0) {
          this.selectionG.visible = true;
          let rings = 0;
          for (const idx of this.selectedAgents) {
            if (idx < n) {
              const isPrimary = (idx === sel);
              this.selectionG.circle(rPx[rBase + idx], rPy[rBase + idx], Math.max(5, cp * 0.75) / cp)
                .stroke({ color: isPrimary ? 0xffffff : 0xfacc15, width: (isPrimary ? 2.5 : 1.5) / cp });
              if (++rings > 250) break;
            }
          }
        } else {
          this.selectionG.visible = false;
        }
      }
      drawBoxSelect() {
        const g = this.boxSelectG, r = this.boxSelectRect;
        if (!r) { this.hide(g); return; }
        g.clear(); g.visible = true;
        const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
        g.rect(x, y, w, h).fill({ color: 0x38bdf8, alpha: 0.15 }).stroke({ color: 0x38bdf8, width: 1.5 / this.cellPx });
      }
      drawGoal(sim, time) {
        const g = this.goalG, { goal, grid } = sim, cp = this.cellPx;
        if (!goal) return this.hide(g);
        g.clear(); g.visible = true;
        const gx = goal.x + 0.5, gy = goal.y + 0.5, arm = Math.max(6 / cp, 1.4);
        g.rect(grid.chunkOriginX(goal.chunk) + 0.05, grid.chunkOriginY(goal.chunk) + 0.05, CS - 0.1, CS - 0.1)
         .stroke({ color: THEME.goal.num, width: 1 / cp, alpha: 0.4 });
        for (let k = 0; k < 2; k++) {
          const t = (time * 0.9 + k * 0.5) % 1;
          g.circle(gx, gy, 0.8 + t * 3.2).stroke({ color: THEME.goal.num, width: 2 / cp, alpha: (1 - t) * 0.85 });
        }
        g.moveTo(gx - arm, gy).lineTo(gx - arm * 0.45, gy).moveTo(gx + arm * 0.45, gy).lineTo(gx + arm, gy)
         .moveTo(gx, gy - arm).lineTo(gx, gy - arm * 0.45).moveTo(gx, gy + arm * 0.45).moveTo(gx, gy + arm)
         .stroke({ color: THEME.goal.num, width: 2.2 / cp })
         .circle(gx, gy, Math.max(3 / cp, 0.32)).fill({ color: THEME.goal.num });
      }
      drawHover(sim, hover) {
        const g = this.hoverG, x = Math.floor(hover.x), y = Math.floor(hover.y);
        this.hide(g);
        if (!Number.isFinite(hover.x) || !sim.grid.inBounds(x, y)) return;
        if (!sim.grid.isWalkable(x, y)) return;
        g.clear(); g.visible = true;
        g.rect(x, y, 1, 1).stroke({ color: THEME.goal.num, width: 1.5 / this.cellPx, alpha: 0.65 });
      }
    }
    return Renderer;
  })();
  //#endregion

  //#region 20: TacticalMinimap
  const Minimap = (() => {
    class Minimap {
      constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bgCanvas = createOffscreen(canvas.width, canvas.height);
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.bgVersion = -1;
      }
      updateBackground(grid) {
        const { bgCtx, bgCanvas } = this;
        const cw = bgCanvas.width, ch = bgCanvas.height;
        bgCtx.fillStyle = '#040711';
        bgCtx.fillRect(0, 0, cw, ch);
        const sx = cw / grid.width, sy = ch / grid.height;
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            const c = grid.costs[y * grid.width + x];
            if (c >= COST_BLOCK) {
              bgCtx.fillStyle = '#1e293b';
              bgCtx.fillRect(x * sx, y * sy, Math.max(1, sx), Math.max(1, sy));
            } else if (c === COST_HIGHWAY) {
              bgCtx.fillStyle = '#0284c7';
              bgCtx.fillRect(x * sx, y * sy, Math.max(1, sx), Math.max(1, sy));
            } else if (c === COST_MUD) {
              bgCtx.fillStyle = '#451a03';
              bgCtx.fillRect(x * sx, y * sy, Math.max(1, sx), Math.max(1, sy));
            }
          }
        }
        this.bgVersion = grid.version;
      }
      render(sim, renderer) {
        if (this.bgVersion !== sim.grid.version) this.updateBackground(sim.grid);
        const { ctx, canvas } = this, { grid, agents } = sim;
        const cw = canvas.width, ch = canvas.height;
        ctx.drawImage(this.bgCanvas, 0, 0);
        const sx = cw / grid.width, sy = ch / grid.height;
        ctx.fillStyle = '#38bdf8';
        const n = agents.count;
        const step = n > 5000 ? 3 : n > 2000 ? 2 : 1;
        for (let i = 0; i < n; i += step) {
          ctx.fillRect(agents.px[i] * sx, agents.py[i] * sy, 1.2, 1.2);
        }
        if (sim.goal) {
          ctx.fillStyle = '#f472b6';
          ctx.beginPath();
          ctx.arc((sim.goal.x + 0.5) * sx, (sim.goal.y + 0.5) * sy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        const cp = renderer.cellPx;
        const vx = (renderer.camera.x - (renderer.cssWidth / 2) / cp) * sx;
        const vy = (renderer.camera.y - (renderer.cssHeight / 2) / cp) * sy;
        const vw = (renderer.cssWidth / cp) * sx;
        const vh = (renderer.cssHeight / cp) * sy;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1;
        ctx.strokeRect(vx, vy, vw, vh);
      }
    }
    return Minimap;
  })();
  //#endregion

  //#region 21: TelemetryAndControlsGUI
  const setupGUIAndHelpers = (() => {
    return (sim, renderer) => {
      function setAgentCount(count) {
        CONFIG.simulation.agentCount = count;
        CONFIG.telemetry.agentCount = count;
        sim.setAgentCount(count);
        if (CONFIG.telemetry.selectedId >= sim.agents.count) CONFIG.telemetry.selectedId = 0;
        audio.playClick();
      }

      function rebuildWorld() {
        CONFIG.world.chunksX = clamp(Math.round(CONFIG.world.chunksX), 3, 24);
        CONFIG.world.chunksY = clamp(Math.round(CONFIG.world.chunksY), 3, 18);
        sim.regenerate(CONFIG.world.seed, CONFIG.world.chunksX, CONFIG.world.chunksY, CONFIG.world);
        renderer.onWorldResized(sim.grid);
        if (CONFIG.telemetry.selectedId >= sim.agents.count) CONFIG.telemetry.selectedId = 0;
        renderer.selectedAgents.clear();
        renderer.selectedAgents.add(CONFIG.telemetry.selectedId);
      }

      function findAgentNear(wx, wy, maxRadius = 1.6) {
        const { agents: A, hash } = sim, r2 = maxRadius * maxRadius;
        const bx = hash.bx(wx), by = hash.by(wy);
        let best = -1, bestD2 = r2;
        for (let yy = Math.max(0, by - 1); yy <= Math.min(hash.rows - 1, by + 1); yy++) {
          for (let xx = Math.max(0, bx - 1); xx <= Math.min(hash.cols - 1, bx + 1); xx++) {
            const b = yy * hash.cols + xx;
            for (let k = hash.start[b], end = hash.start[b + 1]; k < end; k++) {
              const i = hash.items[k];
              const dx = A.px[i] - wx, dy = A.py[i] - wy, d2 = dx * dx + dy * dy;
              if (d2 < bestD2) { bestD2 = d2; best = i; }
            }
          }
        }
        return best;
      }

      const metricsGui = new GUI({ title: 'Metrics & Telemetry', width: 315 });
      metricsGui.domElement.style.position = 'fixed';
      metricsGui.domElement.style.left = '12px';
      metricsGui.domElement.style.right = 'auto';
      metricsGui.domElement.style.top = '12px';
      metricsGui.domElement.style.zIndex = '1000';
      metricsGui.domElement.style.maxHeight = 'calc(100vh - 24px)';
      metricsGui.domElement.style.overflowY = 'auto';

      const fPerf = metricsGui.addFolder('Real-time Diagnostics');
      const sparkFps = fPerf.addSparkline('Framerate', { color: '#38bdf8', unit: 'FPS', min: 0, max: 75, height: 46 });
      const sparkSim = fPerf.addSparkline('Simulation Step', { color: '#a78bfa', unit: 'ms', min: 0, max: 16, height: 46 });
      fPerf.add(CONFIG.telemetry, 'sabMode').name('Memory Backend').listen().disable();
      fPerf.add(CONFIG.telemetry, 'activeWorkers').name('Online SAB Workers').listen().disable();

      const fSwarm = metricsGui.addFolder('Swarm Telemetry');
      const swarmPresets = {
        set1k: () => setAgentCount(1000),
        set5k: () => setAgentCount(5000),
        set10k: () => setAgentCount(10000),
        set20k: () => setAgentCount(20000)
      };
      fSwarm.add(swarmPresets, 'set1k').name('Preset: 1,000 Agents');
      fSwarm.add(swarmPresets, 'set5k').name('Preset: 5,000 Agents');
      fSwarm.add(swarmPresets, 'set10k').name('Preset: 10,000 Agents');
      fSwarm.add(swarmPresets, 'set20k').name('Preset: 20,000 Agents');
      fSwarm.add(CONFIG.telemetry, 'agentCount').name('Total Agents').listen().disable();
      fSwarm.add(CONFIG.telemetry, 'movingCount').name('Moving Agents').listen().disable();
      fSwarm.add(CONFIG.telemetry, 'arrivedCount').name('Arrived at Goal').listen().disable();
      fSwarm.add(CONFIG.telemetry, 'activeChunks').name('Active Chunks').listen().disable();
      fSwarm.add(CONFIG.telemetry, 'flowCacheCount').name('Flow Cache Fields').listen().disable();

      const fAutoTel = metricsGui.addFolder('Auto Goal Status');
      fAutoTel.add(CONFIG.telemetry, 'autoGoalTimer').name('Timer / Status').listen().disable();
      fAutoTel.add({ pick: () => sim.pickRandomGoal() }, 'pick').name('Pick Random Goal');

      const fInspect = metricsGui.addFolder('Agent Inspector');
      fInspect.add(CONFIG.telemetry, 'selectedId').name('Inspected Agent ID').listen().disable();
      fInspect.add(CONFIG.telemetry, 'selectedState').name('Agent State').listen().disable();
      fInspect.add(CONFIG.telemetry, 'selectedSpeed').name('Speed (u/s)').listen().disable();
      fInspect.add(CONFIG.telemetry, 'selectedGoalDist').name('Dist to Goal').listen().disable();
      fInspect.add(CONFIG.telemetry, 'selectedCorridor').name('Corridor Corridor').listen().disable();

      const inspectorCtrl = {
        selectNext: () => {
          if (sim.agents.count === 0) return;
          CONFIG.telemetry.selectedId = (CONFIG.telemetry.selectedId + 1) % sim.agents.count;
          renderer.selectedAgents.clear(); renderer.selectedAgents.add(CONFIG.telemetry.selectedId);
        },
        selectRandom: () => {
          if (sim.agents.count === 0) return;
          CONFIG.telemetry.selectedId = Math.floor(Math.random() * sim.agents.count);
          renderer.selectedAgents.clear(); renderer.selectedAgents.add(CONFIG.telemetry.selectedId);
        },
        selectAll: () => {
          renderer.selectedAgents.clear();
          for (let i = 0; i < Math.min(250, sim.agents.count); i++) renderer.selectedAgents.add(i);
        },
        clearSelect: () => { renderer.selectedAgents.clear(); }
      };
      fInspect.add(inspectorCtrl, 'selectNext').name('Inspect Next');
      fInspect.add(inspectorCtrl, 'selectRandom').name('Inspect Random');
      fInspect.add(inspectorCtrl, 'selectAll').name('Select Sample (250)');
      fInspect.add(inspectorCtrl, 'clearSelect').name('Clear Selection');

      const fActions = metricsGui.addFolder('Tactical Operations');
      fActions.add(CONFIG.simulation, 'paused').name('Pause Simulation');
      fActions.add(renderer, 'followSelected').name('Follow Selected Cam').listen();
      fActions.add({ resetCam: () => renderer.resetCamera(sim.grid) }, 'resetCam').name('Reset Camera View');
      fActions.add(CONFIG.audio, 'enabled').name('Sound FX Enabled');

      const controlsGui = new GUI({ title: 'HFFP Simulator Controls', width: 310 });

      const fW = controlsGui.addFolder('World & Architecture');
      fW.add(CONFIG.world, 'chunksX', 3, 24, 1).name('Chunks Width (X)').onChange(rebuildWorld);
      fW.add(CONFIG.world, 'chunksY', 3, 18, 1).name('Chunks Height (Y)').onChange(rebuildWorld);
      fW.add(CONFIG.world, 'preset', [
        'The Grand Citadel',
        'The Great Maze',
        'Twin Hourglass Bottlenecks',
        'Highway vs Swamp',
        'Open Steppes'
      ]).name('Scenario Preset').onChange(rebuildWorld);
      fW.add(CONFIG.world, 'wallDensity', 0.1, 2.5, 0.1).name('Wall Density').onChange(rebuildWorld);
      fW.add(CONFIG.world, 'mudDensity', 0.0, 3.0, 0.1).name('Mud Density').onChange(rebuildWorld);
      fW.add(CONFIG.world, 'seed', 1, 999999, 1).name('Random Seed').onChange(rebuildWorld);
      fW.add({ rebuildWorld }, 'rebuildWorld').name('Rebuild World');

      const fS = controlsGui.addFolder('Swarm & Physics');
      fS.add(CONFIG.simulation, 'parallelWorkers').name('SAB Multi-Worker');
      fS.add(CONFIG.simulation, 'workerCount', 1, 8, 1).name('Worker Threads').onChange(v => {
        WORKER_POOL.setWorkerCount(v);
      });
      fS.add(CONFIG.simulation, 'simSpeed', 0.1, 10.0, 0.1).name('Speed Multiplier').onChange(v => { sim.simSpeed = v; });
      fS.add(CONFIG.simulation, 'agentCount', 100, MAX_AGENTS, 100).name('Total Agents').listen().onChange(v => {
        setAgentCount(v);
      });
      fS.add(CONFIG.simulation, 'spawnPattern', ['Left Flank', 'Scatter Everywhere', 'Four Corners', 'Center Cluster']).name('Spawn Layout').onChange(v => {
        sim.spawnPattern = v;
        sim.respawnAll();
        sim.publishRenderState();
      });
      fS.add(CONFIG.simulation, 'agentRadius', 0.15, 0.55, 0.05).name('Agent Radius').onChange(r => {
        sim.agentRadius = r;
        sim.hash = new SpatialHash(sim.grid.width, sim.grid.height, Math.max(1.2, r * 3.2), MAX_AGENTS);
        renderer.updateAgentBaseScale(r);
      });
      fS.add(CONFIG.simulation, 'maxSpeed', 1, 50, 0.5).name('Max Speed').onChange(v => { sim.maxSpeed = v; });
      fS.add(CONFIG.simulation, 'steeringGain', 2, 50, 0.5).name('Steering Gain').onChange(v => { sim.steeringGain = v; });
      fS.add(CONFIG.simulation, 'separationStrength', 0, 60, 1).name('Repulsion Force').onChange(v => { sim.separationStrength = v; });
      fS.add(CONFIG.simulation, 'pathBudgetMs', 0.5, 50, 0.5).name('Path Budget (ms)').onChange(v => { sim.pathBudgetMs = v; });

      const fG = controlsGui.addFolder('Auto Goal Routing');
      fG.add(CONFIG.autoGoal, 'enabled').name('Enable Auto Goals');
      fG.add(CONFIG.autoGoal, 'mode', ['Either', 'On Arrival', 'Timer']).name('Trigger Mode');
      fG.add(CONFIG.autoGoal, 'arrivalPct', 0.1, 1.0, 0.05).name('Arrival Target (Ratio)');
      fG.add(CONFIG.autoGoal, 'delay', 0.2, 5.0, 0.1).name('Post-Arrival Pause (s)');
      fG.add(CONFIG.autoGoal, 'interval', 3, 30, 1).name('Max Interval (s)');

      const fPlugins = controlsGui.addFolder('Visual Plugins');
      renderer.pluginManager.attachGUI(fPlugins);

      return { sparkFps, sparkSim, findAgentNear };
    };
  })();
  //#endregion

  //#region 22: PointerAndViewportInteraction
  const attachInteraction = (() => {
    return ({ canvas, minimapCanvas: mCanvas, sim, renderer, hover, findAgentNear }) => {
      let isDown = false, isBoxSelecting = false, dragged = false, isPanning = false;
      let startX = 0, startY = 0, lastX = 0, lastY = 0, boxStart = { x: 0, y: 0 };

      const toScreen = e => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      const toWorld = e => renderer.screenToWorld(...toScreen(e));
      const activePointers = new Map();
      let initDist = 0;

      canvas.onpointerdown = e => {
        audio.init();
        canvas.setPointerCapture?.(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const w = toWorld(e);

        if (e.shiftKey) {
          isBoxSelecting = true;
          boxStart = { x: w.x, y: w.y };
          renderer.boxSelectRect = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
          return;
        }

        if (e.button === 2 || e.button === 1) {
          isPanning = true;
          lastX = e.clientX; lastY = e.clientY;
          return;
        }

        if (activePointers.size === 1) {
          isDown = true;
          dragged = false;
          startX = lastX = e.clientX;
          startY = lastY = e.clientY;
          Object.assign(hover, w);
        } else if (activePointers.size === 2) {
          const [p1, p2] = [...activePointers.values()];
          initDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        }
      };

      canvas.onpointermove = e => {
        if (activePointers.has(e.pointerId)) {
          activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        const w = toWorld(e);
        Object.assign(hover, w);

        if (isPanning) {
          renderer.panBy(e.clientX - lastX, e.clientY - lastY);
          if (renderer.followSelected) renderer.followSelected = false;
          lastX = e.clientX; lastY = e.clientY;
          return;
        }

        if (isBoxSelecting) {
          renderer.boxSelectRect = { x0: boxStart.x, y0: boxStart.y, x1: w.x, y1: w.y };
          return;
        }

        if (activePointers.size === 2) {
          const [p1, p2] = [...activePointers.values()];
          const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (initDist > 0 && d > 0) {
            renderer.zoomAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, d / initDist);
            initDist = d;
          }
          dragged = true;
          return;
        }

        if (isDown) {
          if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) >= 4) {
            dragged = true;
          }
          if (dragged) {
            renderer.panBy(e.clientX - lastX, e.clientY - lastY);
            if (renderer.followSelected) renderer.followSelected = false;
          }
          lastX = e.clientX; lastY = e.clientY;
        }
      };

      const onUp = e => {
        activePointers.delete(e.pointerId);
        const w = toWorld(e);

        if (e.button === 2 || e.button === 1) isPanning = false;

        if (isBoxSelecting) {
          isBoxSelecting = false;
          const r = renderer.boxSelectRect;
          renderer.boxSelectRect = null;
          if (r) {
            const minX = Math.min(r.x0, r.x1), maxX = Math.max(r.x0, r.x1);
            const minY = Math.min(r.y0, r.y1), maxY = Math.max(r.y0, r.y1);
            renderer.selectedAgents.clear();
            const A = sim.agents;
            for (let i = 0; i < A.count; i++) {
              if (A.px[i] >= minX && A.px[i] <= maxX && A.py[i] >= minY && A.py[i] <= maxY) {
                renderer.selectedAgents.add(i);
              }
            }
            if (renderer.selectedAgents.size > 0) {
              CONFIG.telemetry.selectedId = renderer.selectedAgents.values().next().value;
            }
          }
          return;
        }

        if (isDown) {
          if (!dragged) {
            const clickedAgent = findAgentNear(hover.x, hover.y, 1.4);
            if (clickedAgent >= 0) {
              CONFIG.telemetry.selectedId = clickedAgent;
              renderer.selectedAgents.clear();
              renderer.selectedAgents.add(clickedAgent);
            } else {
              sim.setGoal(w.x, w.y, true);
            }
          }
        }

        if (activePointers.size === 0) isDown = dragged = false;
        canvas.hasPointerCapture?.(e.pointerId) && canvas.releasePointerCapture(e.pointerId);
      };

      canvas.onpointerup = canvas.onpointercancel = onUp;
      canvas.onpointerleave = () => { hover.x = hover.y = NaN; };
      canvas.oncontextmenu = e => e.preventDefault();
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        renderer.zoomAt(...toScreen(e), e.deltaY < 0 ? 1.15 : 0.87);
      }, { passive: false });

      let minimapDragging = false;
      const handleMinimapPan = e => {
        const r = mCanvas.getBoundingClientRect();
        const mx = clamp((e.clientX - r.left) / r.width, 0, 1);
        const my = clamp((e.clientY - r.top) / r.height, 0, 1);
        renderer.camera.x = mx * sim.grid.width;
        renderer.camera.y = my * sim.grid.height;
        if (renderer.followSelected) renderer.followSelected = false;
      };
      mCanvas.onpointerdown = e => {
        minimapDragging = true;
        mCanvas.setPointerCapture?.(e.pointerId);
        handleMinimapPan(e);
      };
      mCanvas.onpointermove = e => {
        if (minimapDragging) handleMinimapPan(e);
      };
      mCanvas.onpointerup = mCanvas.onpointercancel = e => {
        minimapDragging = false;
        mCanvas.hasPointerCapture?.(e.pointerId) && mCanvas.releasePointerCapture(e.pointerId);
      };
    };
  })();
  //#endregion

  //#region 23: MainSimulationLoop
  await (async () => {
    const app = new PIXI.Application();
    await app.init({ canvas, resizeTo: window, autoDensity: true, antialias: false, backgroundColor: 0x040711 });
    app.ticker?.stop?.();

    const sim = new Simulation({ ...CONFIG.world, ...CONFIG.simulation });
    const renderer = new Renderer(app);
    renderer.resetCamera(sim.grid);

    const minimap = new Minimap(minimapCanvas);
    renderer.pluginManager.register(new MinimapPlugin(minimap, minimapCard));

    const hover = { x: NaN, y: NaN };

    const onResize = () => renderer.resize(innerWidth, innerHeight);
    window.onresize = onResize;
    onResize();

    const { sparkFps, sparkSim, findAgentNear } = setupGUIAndHelpers(sim, renderer);
    attachInteraction({ canvas, minimapCanvas, sim, renderer, hover, findAgentNear });

    let last = performance.now(), frames = 0, fpsTimer = 0;
    const start = last;
    const stateNames = ['Idle', 'Moving', 'Arrived', 'No Path'];

    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      frames++;
      fpsTimer += dt;

      if (fpsTimer >= 0.5) {
        const curFps = Math.round(frames / fpsTimer);
        CONFIG.telemetry.fps = curFps;
        CONFIG.telemetry.simMs = parseFloat(sim.lastSimDuration.toFixed(1));
        CONFIG.telemetry.activeWorkers = SUPPORTS_SAB && CONFIG.simulation.parallelWorkers
          ? Math.min(CONFIG.simulation.workerCount, Atomics.load(SHARED_ARENA.views.ctrl, CTRL.ONLINE_WORKERS))
          : 0;
        CONFIG.telemetry.agentCount = sim.agents.count;
        CONFIG.telemetry.movingCount = sim.agents.count - sim.arrivedAtGoal;
        CONFIG.telemetry.arrivedCount = sim.arrivedAtGoal;
        CONFIG.telemetry.flowCacheCount = sim.flowCache.entries.size;

        let actCnt = 0;
        for (let i = 0; i < sim.grid.chunkCount; i++) if (sim.activeStamp[i] === sim.frame) actCnt++;
        CONFIG.telemetry.activeChunks = actCnt;

        sparkFps.push(curFps);
        sparkSim.push(sim.lastSimDuration);

        if (CONFIG.autoGoal.enabled && sim.goal) {
          const pct = (sim.agents.count > 0 ? (sim.arrivedAtGoal / sim.agents.count) : 0);
          const rem = Math.max(0, CONFIG.autoGoal.interval - sim.autoGoalTimer).toFixed(0);
          CONFIG.telemetry.autoGoalTimer = `${rem}s (${Math.round(pct * 100)}% arr)`;
        } else {
          CONFIG.telemetry.autoGoalTimer = CONFIG.autoGoal.enabled ? 'Active' : 'Disabled';
        }

        const sel = CONFIG.telemetry.selectedId;
        if (sel >= 0 && sel < sim.agents.count) {
          const st = sim.agents.state[sel];
          CONFIG.telemetry.selectedState = stateNames[st] || 'Unknown';
          const spd = Math.hypot(sim.agents.vx[sel], sim.agents.vy[sel]);
          CONFIG.telemetry.selectedSpeed = parseFloat(spd.toFixed(1));
          if (sim.goal) {
            const d = Math.hypot(sim.goal.x + 0.5 - sim.agents.px[sel], sim.goal.y + 0.5 - sim.agents.py[sel]);
            CONFIG.telemetry.selectedGoalDist = parseFloat(d.toFixed(1));
          } else {
            CONFIG.telemetry.selectedGoalDist = 0.0;
          }
          const p = sim.agents.paths[sel];
          CONFIG.telemetry.selectedCorridor = p ? `${p.chunks.length} chunks (${p.portals.length} portals)` : 'Direct';
        } else {
          CONFIG.telemetry.selectedState = '--';
          CONFIG.telemetry.selectedSpeed = 0.0;
          CONFIG.telemetry.selectedGoalDist = 0.0;
          CONFIG.telemetry.selectedCorridor = '--';
        }

        frames = 0;
        fpsTimer = 0;
      }

      if (!CONFIG.simulation.paused) sim.update(dt);
      renderer.render(sim, CONFIG.telemetry.selectedId, hover, (now - start) / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })();
  //#endregion
})();