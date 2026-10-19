'use client';

import * as React from 'react';
import { RotateCw } from 'lucide-react';
import type { PeriodPreset } from '@/lib/analytics-period';
import type { Currency } from '@/lib/api/types';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';

interface PresetOption {
  value: PeriodPreset;
  label: string;
}

const PRESETS: PresetOption[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: 'ytd', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

export interface AnalyticsControlsProps {
  preset: PeriodPreset;
  onSelectPreset: (preset: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustomChange: (from: string, to: string) => void;
  customError: string | null;
  currencies: Currency[];
  selectedCurrency: Currency;
  onSelectCurrency: (currency: Currency) => void;
  rangeLabel: string;
  isUpdating: boolean;
}

export function AnalyticsControls({
  preset,
  onSelectPreset,
  customFrom,
  customTo,
  onCustomChange,
  customError,
  currencies,
  selectedCurrency,
  onSelectCurrency,
  rangeLabel,
  isUpdating,
}: AnalyticsControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Period preset"
          options={PRESETS}
          value={preset}
          onChange={onSelectPreset}
          size="sm"
        />

        {currencies.length > 0 && (
          <Segmented
            label="Currency"
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={selectedCurrency}
            onChange={onSelectCurrency}
            size="sm"
            className="self-start lg:self-auto"
          />
        )}
      </div>

      {/* Custom Date Inputs */}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <label htmlFor="custom-from" className="font-medium text-foreground">
              From
            </label>
            <Input
              id="custom-from"
              type="date"
              value={customFrom}
              onChange={(e) => onCustomChange(e.target.value, customTo)}
              className="h-8 w-36 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <label htmlFor="custom-to" className="font-medium text-foreground">
              To
            </label>
            <Input
              id="custom-to"
              type="date"
              value={customTo}
              onChange={(e) => onCustomChange(customFrom, e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </div>
          {customError && (
            <p className="text-xs text-destructive" role="alert">
              {customError}
            </p>
          )}
        </div>
      )}

      {/* Explicit Period Label & Updating State */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{rangeLabel}</span>
        {isUpdating && (
          <span className="inline-flex items-center gap-1 font-medium text-accent-foreground">
            <RotateCw className="size-3 animate-spin" aria-hidden="true" />
            Updating...
          </span>
        )}
      </div>
    </div>
  );
}
