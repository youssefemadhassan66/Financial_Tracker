import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CategorySpending } from '@/lib/api/types';
import { PartToWhole } from './part-to-whole';

const cat = (id: string, name: string, share: number): CategorySpending => ({
  categoryId: id,
  name,
  icon: null,
  total: '100.00',
  share,
  count: 1,
  previousTotal: '0.00',
  changePercent: null,
});

/** The legend swatch color shown next to a category name. */
function swatchColor(name: string): string | undefined {
  const label = screen.getAllByText(name)[0];
  const row = label.closest('li') ?? label.parentElement!;
  const swatch = row.querySelector<HTMLElement>('[style*="background"]');
  return swatch?.style.backgroundColor || swatch?.style.background;
}

describe('PartToWhole colors', () => {
  it('keeps a category color when its rank changes between renders (period or currency switch)', () => {
    const colorMap = new Map<string, string>();
    const props = { currency: 'EGP' as const, periodFrom: '2026-09-01', periodTo: '2026-09-30', colorMap };

    const { rerender } = render(
      <PartToWhole {...props} categories={[cat('cat-a', 'Alpha', 60), cat('cat-b', 'Beta', 40)]} />,
    );
    const alpha1 = swatchColor('Alpha');
    const beta1 = swatchColor('Beta');
    expect(alpha1).toBeTruthy();
    expect(alpha1).not.toBe(beta1);

    rerender(<PartToWhole {...props} categories={[cat('cat-b', 'Beta', 70), cat('cat-a', 'Alpha', 30)]} />);
    expect(swatchColor('Alpha')).toBe(alpha1);
    expect(swatchColor('Beta')).toBe(beta1);
  });
});
