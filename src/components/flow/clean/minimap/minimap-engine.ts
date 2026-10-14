import type { useStoreApi } from "@xyflow/react";
import { useFactoryStore } from "@/store/factory-store";
import { drawMinimap, type MapView } from "./minimap-draw";
import { readMinimapRoutes } from "./minimap-feed";
import { getMinimap, MINIMAP_SIZES, MINIMAP_ZOOMS } from "./minimap-settings";
import { buildScene, type DrawerKind, type Scene, type SceneNode, type TileExtras } from "./minimap-scene";
import { publishMinimapScene } from "./scene-store";

/**
 * The map's frame loop, outside React: it listens to the board's own store, rebuilds the scene when nodes or
 * edges change (at most once a frame), and redraws when the camera moves. Nothing per frame touches the DOM but
 * the one canvas.
 */

type StoreApi = ReturnType<typeof useStoreApi>;

const IMAGE_CACHE = new Map<string, HTMLImageElement | "loading" | "failed">();

function urlOf(css: string): string | undefined {
  const m = /url\((?:"|')?([^"')]+)(?:"|')?\)/.exec(css);
  return m?.[1];
}

/** What a card's or drawer's own DOM carries that its node data does not: the picture, the drawer's role and rate. */
export function readExtras(root: Element | null, id: string, type: string | undefined): TileExtras | undefined {
  if (!root) return undefined;
  const el = root.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return undefined;
  if (type === "recipeNode") {
    const glance = el.querySelector<HTMLElement>(".cc-glance");
    return { art: glance ? urlOf(glance.style.backgroundImage) : undefined };
  }
  if (type === "storageNode") {
    const cd = el.querySelector<HTMLElement>(".cd");
    const kind = cd?.dataset.kind as DrawerKind | undefined;
    const num = el.querySelector<HTMLElement>(".cd-num");
    const zero = num?.hasAttribute("data-zero");
    const icon = el.querySelector<HTMLElement>(".cd-icon");
    const img = icon?.querySelector("img");
    const art = img?.getAttribute("src") ?? (icon ? urlOf(icon.style.backgroundImage) : undefined);
    const text = num?.textContent?.trim();
    const sign = kind === "source" ? "-" : "+";
    return {
      drawer: kind,
      art: art ?? undefined,
      rate: text && !zero ? `${sign}${text}` : undefined,
      label: el.querySelector(".cd-name")?.textContent ?? undefined,
    };
  }
  return undefined;
}

export class MinimapEngine {
  scene: Scene | undefined;
  view: MapView | undefined;
  /** While a press carries the board, the map holds still on this point instead of following the board. */
  frozen: { x: number; y: number } | undefined;
  private raf = 0;
  private dirty = { scene: true, draw: true };
  private extras = new Map<string, { data: unknown; extras: TileExtras | undefined }>();
  private routesSig = "";
  private stopped = false;

  constructor(
    private readonly store: StoreApi,
    private readonly canvas: () => HTMLCanvasElement | null,
  ) {}

  schedule(what: "scene" | "draw"): void {
    if (this.stopped) return;
    if (what === "scene") this.dirty.scene = true;
    this.dirty.draw = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  /** Starts listening; returns the stop function. */
  start(): () => void {
    this.stopped = false;
    this.schedule("scene");
    const unsubscribe = this.store.subscribe((state, prev) => {
      if (state.nodes !== prev.nodes || state.edges !== prev.edges || state.nodeLookup !== prev.nodeLookup) {
        this.schedule("scene");
      } else if (state.transform !== prev.transform || state.width !== prev.width || state.height !== prev.height) {
        this.schedule("draw");
      }
    });
    // New routes land after the nodes do: look again a few times a second while the map is up.
    const poll = window.setInterval(() => {
      const snapshot = readMinimapRoutes();
      if ((snapshot?.signature ?? "") !== this.routesSig) this.schedule("scene");
    }, 400);
    return () => {
      this.stopped = true;
      unsubscribe();
      window.clearInterval(poll);
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    };
  }

  private rebuild(): void {
    const state = this.store.getState();
    const root = state.domNode ?? null;
    const nodes: SceneNode[] = [];
    for (const [id, node] of state.nodeLookup) {
      nodes.push({
        id,
        type: node.type,
        x: node.internals.positionAbsolute.x,
        y: node.internals.positionAbsolute.y,
        w: node.measured?.width ?? node.width ?? 0,
        h: node.measured?.height ?? node.height ?? 0,
        hidden: node.hidden,
        selected: node.selected,
        data: node.data,
      });
    }
    const cache = this.extras;
    const extras = (id: string) => {
      const node = state.nodeLookup.get(id);
      if (!node) return undefined;
      const hit = cache.get(id);
      if (hit && hit.data === node.data) return hit.extras;
      const fresh = readExtras(root, id, node.type);
      cache.set(id, { data: node.data, extras: fresh });
      return fresh;
    };
    const snapshot = readMinimapRoutes();
    this.routesSig = snapshot?.signature ?? "";
    this.scene = buildScene({
      name: useFactoryStore.getState().project.name ?? "",
      nodes,
      edges: state.edges as never,
      routes: snapshot?.routes,
      extras,
    });
    publishMinimapScene(this.scene);
  }

  private tick(): void {
    this.raf = 0;
    const canvas = this.canvas();
    if (!canvas || this.stopped) return;
    if (this.dirty.scene) {
      this.dirty.scene = false;
      this.rebuild();
    }
    if (!this.dirty.draw) return;
    this.dirty.draw = false;
    const state = this.store.getState();
    const [tx, ty, tz] = state.transform;
    const viewW = state.width / tz;
    const viewH = state.height / tz;
    const viewRect = { x: -tx / tz, y: -ty / tz, w: viewW, h: viewH };
    let cx = viewRect.x + viewW / 2;
    let cy = viewRect.y + viewH / 2;
    const cfg = getMinimap();
    if (this.frozen) {
      cx = this.frozen.x;
      cy = this.frozen.y;
    } else if (cfg.follow) {
      const sel = this.scene?.tiles.find((t) => t.selected);
      if (sel) {
        cx = sel.x + sel.w / 2;
        cy = sel.y + sel.h / 2;
      }
    }
    const dpr = window.devicePixelRatio || 1;
    const side = MINIMAP_SIZES[cfg.size];
    const px = Math.round(side * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view: MapView = {
      cx,
      cy,
      zoom: MINIMAP_ZOOMS[cfg.zoom] ?? MINIMAP_ZOOMS[2],
      size: side,
      circle: cfg.shape === "circle",
    };
    drawMinimap(ctx, this.scene, view, {
      font: getComputedStyle(canvas).fontFamily || "monospace",
      viewRect,
      image: (url) => {
        const hit = IMAGE_CACHE.get(url);
        if (hit instanceof HTMLImageElement) return hit;
        if (hit === undefined) {
          IMAGE_CACHE.set(url, "loading");
          const img = new Image();
          img.onload = () => {
            IMAGE_CACHE.set(url, img);
            this.schedule("draw");
          };
          img.onerror = () => IMAGE_CACHE.set(url, "failed");
          img.src = url;
        }
        return undefined;
      },
    });
    this.view = view;
  }
}
