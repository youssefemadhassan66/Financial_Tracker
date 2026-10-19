import { describe, expect, it } from 'vitest';
import type { CategorySpending } from './api/types';
import { CHART_PALETTE, foldTopCategories, OTHER_COLOR } from './chart-categories';

describe('foldTopCategories', () => {
  const makeCategory = (id: string | null, name: string, total: string, share: number): CategorySpending => ({
    categoryId: id,
    name,
    icon: null,
    total,
    share,
    count: 2,
    previousTotal: '100.00',
    changePercent: 10,
  });

  it('handles empty category list', () => {
    const res = foldTopCategories([]);
    expect(res.segments).toEqual([]);
    expect(res.colorMap.size).toBe(0);
  });

  it('handles fewer than 5 categories without Other segment', () => {
    const categories: CategorySpending[] = [
      makeCategory('11111111-1111-1111-1111-111111111111', 'Food', '500.00', 50),
      makeCategory('22222222-2222-2222-2222-222222222222', 'Rent', '300.00', 30),
      makeCategory('33333333-3333-3333-3333-333333333333', 'Bills', '200.00', 20),
    ];

    const res = foldTopCategories(categories);
    expect(res.segments).toHaveLength(3);
    expect(res.segments.some((s) => s.isOther)).toBe(false);
    expect(res.segments[0].color).toBe(CHART_PALETTE[0]);
    expect(res.segments[1].color).toBe(CHART_PALETTE[1]);
    expect(res.segments[2].color).toBe(CHART_PALETTE[2]);
  });

  it('handles Uncategorized row with categoryId null', () => {
    const categories: CategorySpending[] = [
      makeCategory('11111111-1111-1111-1111-111111111111', 'Food', '500.00', 60),
      makeCategory(null, 'Uncategorized', '300.00', 40),
    ];

    const res = foldTopCategories(categories);
    expect(res.segments).toHaveLength(2);
    expect(res.segments[1].categoryId).toBeNull();
    expect(res.segments[1].name).toBe('Uncategorized');
    expect(res.colorMap.get('uncategorized')).toBe(CHART_PALETTE[1]);
  });

  it('folds categories beyond 5 into Other using neutral token', () => {
    const categories: CategorySpending[] = [
      makeCategory('11111111-1111-1111-1111-111111111111', 'Cat 1', '100.00', 25),
      makeCategory('22222222-2222-2222-2222-222222222222', 'Cat 2', '80.00', 20),
      makeCategory('33333333-3333-3333-3333-333333333333', 'Cat 3', '60.00', 15),
      makeCategory('44444444-4444-4444-4444-444444444444', 'Cat 4', '50.00', 12.5),
      makeCategory('55555555-5555-5555-5555-555555555555', 'Cat 5', '40.00', 10),
      makeCategory('66666666-6666-6666-6666-666666666666', 'Cat 6', '30.00', 7.5),
      makeCategory('77777777-7777-7777-7777-777777777777', 'Cat 7', '20.00', 5),
      makeCategory('88888888-8888-8888-8888-888888888888', 'Cat 8', '20.00', 5),
    ];

    const res = foldTopCategories(categories);
    expect(res.segments).toHaveLength(6);

    const other = res.segments[5];
    expect(other.name).toBe('Other');
    expect(other.isOther).toBe(true);
    expect(other.color).toBe(OTHER_COLOR);
    expect(other.total).toBe('70.00'); // 30 + 20 + 20
    expect(other.share).toBe(17.5); // 7.5 + 5 + 5
    expect(other.count).toBe(6); // 2 + 2 + 2
  });

  it('keeps category colors stable across calls when rank changes', () => {
    const session1: CategorySpending[] = [
      makeCategory('cat-a', 'Alpha', '500.00', 60),
      makeCategory('cat-b', 'Beta', '300.00', 40),
    ];

    const res1 = foldTopCategories(session1);
    expect(res1.segments[0].color).toBe(CHART_PALETTE[0]); // Alpha -> chart-1
    expect(res1.segments[1].color).toBe(CHART_PALETTE[1]); // Beta -> chart-2

    // Now in period 2, Beta is rank 1 and Alpha is rank 2, and Gamma is added
    const session2: CategorySpending[] = [
      makeCategory('cat-b', 'Beta', '600.00', 50),
      makeCategory('cat-a', 'Alpha', '400.00', 33),
      makeCategory('cat-c', 'Gamma', '200.00', 17),
    ];

    const res2 = foldTopCategories(session2, res1.colorMap);
    // Beta must retain chart-2, Alpha must retain chart-1
    expect(res2.segments[0].name).toBe('Beta');
    expect(res2.segments[0].color).toBe(CHART_PALETTE[1]); // Retained chart-2!
    expect(res2.segments[1].name).toBe('Alpha');
    expect(res2.segments[1].color).toBe(CHART_PALETTE[0]); // Retained chart-1!
    // Gamma takes chart-3
    expect(res2.segments[2].name).toBe('Gamma');
    expect(res2.segments[2].color).toBe(CHART_PALETTE[2]);
  });

  it('never gives two visible categories the same color when a newcomer enters a full palette', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id, i) => makeCategory(`cat-${id}`, id, '100.00', 20 - i));
    const res1 = foldTopCategories(five);

    // "f" enters at rank 1 while a-d stay visible; e drops out.
    const next = [makeCategory('cat-f', 'f', '900.00', 40), ...five.slice(0, 4)];
    const res2 = foldTopCategories(next, res1.colorMap);

    const colors = res2.segments.map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
    // a-d keep their colors; f takes the one e released.
    expect(res2.segments.slice(1).map((s) => s.color)).toEqual(res1.segments.slice(0, 4).map((s) => s.color));
    expect(res2.segments[0].color).toBe(res1.segments[4].color);

    // e comes back alongside f: it must not reuse f's color.
    const res3 = foldTopCategories([five[4], next[0], ...five.slice(0, 3)], res2.colorMap);
    const colors3 = res3.segments.map((s) => s.color);
    expect(new Set(colors3).size).toBe(colors3.length);
  });
});
