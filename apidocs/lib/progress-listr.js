// Interactive (TTY) progress backend: drives a listr2 task tree that updates
// in place instead of scrolling. Selected by progress.js only for full builds
// on a real terminal; dev `--serve` and CI keep the line-based output.
//
// The build's phases fire imperatively across Eleventy's before/render/after
// callbacks, but listr2 wants to own a single run loop. We bridge with a small
// latched event bus: each phase task blocks on a bus event that progress.js
// emits from stage()/page()/linkPage(). "Latched" because a fast stage can emit
// its `done` before listr's sequential walk reaches that task and subscribes —
// replaying the last event to late subscribers closes that sub-millisecond gap.

import { Listr, PRESET_TIMER } from "listr2";

// Fixed full-build phase order. Keys match the labels progress.stage() is
// called with, except "render" — Eleventy's own page loop, which isn't wrapped
// in a stage(). Its task streams the page/image counter and closes when the
// first post-build stage ("css") starts.
const PHASES = [
  ["js", "Bundle scripts"],
  ["navigation", "Build navigation"],
  ["render", "Render pages"],
  ["css", "Bundle styles"],
  ["markdown", "Write markdown"],
  ["images", "Prune image variants"],
  ["symbols", "Write symbols"],
  ["pagefind", "Index (Pagefind)"],
  ["links", "Check links"]
];

// Minimal event emitter that remembers the last payload per event, so a
// once() handler registered after the event already fired still runs.
class Latch {
  constructor() {
    this.handlers = new Map();
    this.fired = new Map();
  }

  on(evt, cb) {
    const arr = this.handlers.get(evt) || [];
    arr.push(cb);
    this.handlers.set(evt, arr);
  }

  once(evt, cb) {
    if (this.fired.has(evt)) {
      cb(this.fired.get(evt));
      return;
    }
    const wrap = payload => {
      this.off(evt, wrap);
      cb(payload);
    };
    this.on(evt, wrap);
  }

  off(evt, cb) {
    const arr = this.handlers.get(evt);
    if (!arr) {
      return;
    }
    const i = arr.indexOf(cb);
    if (i >= 0) {
      arr.splice(i, 1);
    }
  }

  emit(evt, payload) {
    this.fired.set(evt, payload);
    for (const cb of this.handlers.get(evt) || []) {
      cb(payload);
    }
  }
}

export function createListrBackend({ verbose = false, dev = false } = {}) {
  const bus = new Latch();

  // Dev (--serve) builds skip the image prune and link check entirely (see
  // index.js: both are gated on !isDev), so drop those phases from the tree —
  // otherwise they'd sit pending until the buildEnd backstop and paint as done
  // work that never ran.
  const phases = dev ? PHASES.filter(([key]) => key !== "images" && key !== "links") : PHASES;

  const tasks = phases.map(([key, title]) => ({
    title,
    task: (_ctx, task) =>
      new Promise((resolve, reject) => {
        if (key === "render") {
          // No stage() wraps Eleventy's render loop. Stream the live counter
          // into the task output and close the phase when css (the first
          // post-build stage) begins.
          bus.on("render", text => {
            task.output = text;
          });
          bus.once("start:css", resolve);
        } else {
          if (key === "links") {
            bus.on("linkPage", text => {
              task.output = text;
            });
          }
          bus.once(`done:${key}`, note => {
            if (note) {
              task.title = `${title} — ${note}`;
            }
            resolve();
          });
          bus.once(`fail:${key}`, reject);
        }

        // Backstop: a phase that doesn't run this build (e.g. link check
        // disabled, or no images) never emits its done event. endBuild() fires
        // buildEnd to release any straggler so the tree can finalize.
        bus.once("buildEnd", resolve);
      })
  }));

  // `default` renders the live, in-place tree on a real terminal and
  // auto-falls-back to `simple` (append-only lines) when output isn't a TTY —
  // so CI and piped builds stay readable with no extra branching. `--verbose`
  // (APIDOCS_VERBOSE) forces the `verbose` renderer everywhere: one tagged line
  // per state change, the classic dense CI log.
  const renderer = verbose ? "verbose" : "default";
  const listr = new Listr(tasks, {
    concurrent: false,
    renderer,
    fallbackRenderer: verbose ? "verbose" : "simple",
    rendererOptions: { timer: PRESET_TIMER, collapseSubtasks: false },
    fallbackRendererOptions: { timer: PRESET_TIMER }
  });

  // Start rendering now; tasks block on bus events the build feeds as it runs.
  // A failed stage rejects its task, which rejects run() — swallow it here: the
  // original error already propagates through stage()/Eleventy, and this
  // rejection only exists to paint the task red.
  const runPromise = listr.run().catch(() => {});

  return {
    stageStart(label) {
      bus.emit(`start:${label}`);
    },
    stageDone(label, note) {
      bus.emit(`done:${label}`, note || null);
    },
    stageFail(label, err) {
      bus.emit(`fail:${label}`, err);
    },
    setRender(text) {
      bus.emit("render", text);
    },
    setLinkPage(text) {
      bus.emit("linkPage", text);
    },
    finish() {
      bus.emit("buildEnd");
      return runPromise;
    }
  };
}
