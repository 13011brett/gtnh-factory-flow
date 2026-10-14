/**
 * Where the minimap gets the board's routed wires. The router's cache lives inside `FactoryFlow.tsx`; the board
 * registers one reader here when it installs a solve, and the map asks for it when it draws (never per frame:
 * only when the signature moved).
 */

export interface MinimapRoute {
  edgeId: string;
  points: Array<{ x: number; y: number }>;
  width?: number;
}

export interface MinimapRouteSnapshot {
  signature: string;
  routes: MinimapRoute[];
}

let reader: (() => MinimapRouteSnapshot) | undefined;

export function registerMinimapRoutes(read: (() => MinimapRouteSnapshot) | undefined): void {
  reader = read;
}

export function readMinimapRoutes(): MinimapRouteSnapshot | undefined {
  try {
    return reader?.();
  } catch {
    return undefined;
  }
}
