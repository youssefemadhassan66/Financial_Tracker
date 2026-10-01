import Decimal from 'decimal.js';
import type { CategorySpending } from './api/types';

export const CHART_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export const OTHER_COLOR = 'var(--muted-foreground)';

export interface FoldedCategorySegment {
  categoryId: string | null;
  name: string;
  total: string;
  share: number;
  count: number;
  previousTotal?: string;
  changePercent?: number | null;
  color: string;
  isOther?: boolean;
}

export interface FoldCategoriesResult {
  segments: FoldedCategorySegment[];
  colorMap: Map<string, string>;
}

/**
 * Folds categories into top 5 + "Other".
 * Stable color map: maps categoryId (or "uncategorized") to one of --chart-1..5.
 * Colors follow the entity, not the rank, across period/currency changes.
 */
export function foldTopCategories(
  categories: CategorySpending[],
  existingColorMap?: Map<string, string>,
): FoldCategoriesResult {
  const colorMap = new Map<string, string>(existingColorMap ?? []);

  if (!categories || categories.length === 0) {
    return { segments: [], colorMap };
  }

  const top5 = categories.slice(0, 5);
  const remaining = categories.slice(5);

  // Colors already held by categories visible in THIS chart are off limits, so
  // two visible segments never share a color. A newcomer takes the first color
  // no visible category holds, taking it away from any hidden category that
  // had it (that one gets a fresh color if it shows up again).
  const keyOf = (c: CategorySpending) => c.categoryId ?? 'uncategorized';
  const reserved = new Set(
    top5.map((c) => colorMap.get(keyOf(c))).filter((col): col is string => col !== undefined),
  );

  const segments: FoldedCategorySegment[] = top5.map((c) => {
    const key = keyOf(c);
    let color = colorMap.get(key);
    if (!color) {
      // Always found: at most 5 visible categories and 5 palette colors.
      color = CHART_PALETTE.find((col) => !reserved.has(col))!;
      reserved.add(color);
      for (const [otherKey, otherColor] of colorMap) {
        if (otherColor === color) colorMap.delete(otherKey);
      }
      colorMap.set(key, color);
    }

    return {
      categoryId: c.categoryId,
      name: c.name,
      total: c.total,
      share: c.share,
      count: c.count,
      previousTotal: c.previousTotal,
      changePercent: c.changePercent,
      color,
      isOther: false,
    };
  });

  if (remaining.length > 0) {
    const otherTotal = remaining
      .reduce((acc, cat) => acc.plus(new Decimal(cat.total)), new Decimal(0))
      .toFixed(2);

    const otherShare = Number(
      remaining.reduce((acc, cat) => acc + cat.share, 0).toFixed(1),
    );

    const otherCount = remaining.reduce((acc, cat) => acc + cat.count, 0);

    segments.push({
      categoryId: null,
      name: 'Other',
      total: otherTotal,
      share: otherShare,
      count: otherCount,
      color: OTHER_COLOR,
      isOther: true,
    });
  }

  return { segments, colorMap };
}
