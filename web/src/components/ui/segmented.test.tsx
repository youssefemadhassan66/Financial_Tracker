import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Segmented } from './segmented';

const options = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
] as const;

function Harness({ dir }: { dir?: 'rtl' }) {
  const [value, setValue] = React.useState<'month' | 'year' | 'all'>('month');
  return (
    <div dir={dir}>
      <Segmented label="Period" options={options} value={value} onChange={setValue} />
    </div>
  );
}

describe('Segmented', () => {
  afterEach(() => cleanup());

  it('is a radio group with exactly one Tab stop on the selected option', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Period' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Year' })).toHaveAttribute('tabindex', '-1');
  });

  it('arrow keys move the selection and the focus, wrapping around', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Month' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Year' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Year' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Year' }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Month' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  });

  it('flips left and right in right-to-left layouts', () => {
    render(<Harness dir="rtl" />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Month' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Year' })).toHaveAttribute('aria-checked', 'true');
  });

  it('clicking selects', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'false');
  });
});
