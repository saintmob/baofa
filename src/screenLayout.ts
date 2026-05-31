export type ScreenLayoutItem = {
  id: string;
  displayId?: string;
  col: number;
  row: number;
  width?: number;
  height?: number;
  rotate?: number;
};

export const DEFAULT_SCREEN_ID = 'D2';

export const STAGE_BOUNDS = {
  width: 11,
  height: 6.4,
  centerCol: 5.5,
  centerRow: 3.35,
};

export const MASTER_SCREEN: ScreenLayoutItem = {
  id: 'A1',
  displayId: 'A1',
  col: 5.5,
  row: 0.7,
  width: 3.9,
  height: 1.05,
};

export const SCREEN_LAYOUT_ITEMS: ScreenLayoutItem[] = [
  { id: 'B1', col: 2.9, row: 1.75 },
  { id: 'B2', col: 3.95, row: 1.75 },
  { id: 'B3', col: 5.0, row: 1.75 },
  { id: 'B4', col: 6.05, row: 1.75 },
  { id: 'B5', col: 7.1, row: 1.75 },
  { id: 'B6', col: 8.15, row: 1.75 },
  { id: 'C1', col: 1.75, row: 2.55, rotate: -14 },
  { id: 'C2', col: 2.55, row: 2.35, rotate: -4 },
  { id: 'C3', col: 8.45, row: 2.35, rotate: 4 },
  { id: 'C4', col: 9.25, row: 2.55, rotate: 14 },
  { id: 'D1', col: 4.2, row: 3.35 },
  { id: 'D2', col: 5.5, row: 3.15 },
  { id: 'D3', col: 6.8, row: 3.35 },
  { id: 'E1', col: 5.5, row: 4.35, width: 1.15 },
  { id: 'F1', col: 5.5, row: 5.55, width: 1.2 },
  { id: 'L1', col: 0.95, row: 4.2, height: 0.82 },
  { id: 'L2', col: 0.95, row: 5.4, height: 0.82 },
  { id: 'R1', col: 10.05, row: 4.2, height: 0.82 },
  { id: 'R2', col: 10.05, row: 5.4, height: 0.82 },
];

export const SHOW_SCREEN_LAYOUT_ITEMS = [MASTER_SCREEN, ...SCREEN_LAYOUT_ITEMS];

export const SHOW_SCREEN_TOPOLOGY = [
  ['A1'],
  ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
  ['C1', 'C2', 'C3', 'C4'],
  ['D1', 'D2', 'D3'],
  ['L1', 'E1', 'R1'],
  ['L2', 'F1', 'R2'],
];

export const SCREEN_LAYOUT: Record<string, ScreenLayoutItem> = {
  MASTER: MASTER_SCREEN,
  A1: MASTER_SCREEN,
  ...Object.fromEntries(SCREEN_LAYOUT_ITEMS.map((screen) => [screen.id, screen])),
};

export const ALL_SCREEN_LAYOUT_ITEMS = SHOW_SCREEN_LAYOUT_ITEMS;

const WORLD_CELL_SIZE = {
  x: 5.8,
  y: 5.2,
};

export function layoutToWorldPoint(screen: Pick<ScreenLayoutItem, 'col' | 'row'>) {
  return {
    x: (screen.col - STAGE_BOUNDS.centerCol) * WORLD_CELL_SIZE.x,
    y: (STAGE_BOUNDS.centerRow - screen.row) * WORLD_CELL_SIZE.y,
    z: 0,
  };
}

export function getScreenWorldPointData(id = DEFAULT_SCREEN_ID) {
  return layoutToWorldPoint(SCREEN_LAYOUT[id] ?? SCREEN_LAYOUT[DEFAULT_SCREEN_ID]);
}

export function isKnownScreenId(id: string | null | undefined) {
  return Boolean(id && SCREEN_LAYOUT[id]);
}

export function getScreenDisplayId(id: string) {
  return SCREEN_LAYOUT[id]?.displayId ?? id;
}

export function getNearestScreenId(col: number, row: number, fallback = DEFAULT_SCREEN_ID) {
  let nearest = fallback;
  let nearestDistance = Number.POSITIVE_INFINITY;

  ALL_SCREEN_LAYOUT_ITEMS.forEach((screen) => {
    const width = screen.width ?? 0.78;
    const height = screen.height ?? 0.52;
    const halfWidth = width / 2 + 0.24;
    const halfHeight = height / 2 + 0.24;
    const dx = Math.abs(col - screen.col);
    const dy = Math.abs(row - screen.row);

    if (dx <= halfWidth && dy <= halfHeight) {
      nearest = screen.id;
      nearestDistance = 0;
      return;
    }

    const weightedDistance = Math.hypot(dx / Math.max(width, 0.78), dy / Math.max(height, 0.52));
    if (weightedDistance < nearestDistance) {
      nearest = screen.id;
      nearestDistance = weightedDistance;
    }
  });

  return nearestDistance <= 1.7 ? nearest : fallback;
}
