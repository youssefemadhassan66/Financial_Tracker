'use client';

import { motion } from 'motion/react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { DURATION_HIGHLIGHT, EASE_OUT_QUART } from '@/components/motion/motion-tokens';
import { staggerItemVariants } from '@/components/motion/stagger';
import type { TransactionView } from '@/lib/api/types';
import { formatInstantDay, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * One transaction. Direction is carried by an icon, a sign and a label for
 * screen readers, never by color alone (PRODUCT.md accessibility).
 */
export function TransactionRow({
  tx,
  showDate = true,
  isNew = false,
  staggerIndex,
}: {
  tx: TransactionView;
  showDate?: boolean;
  isNew?: boolean;
  staggerIndex?: number;
}) {
  const isTransfer = tx.kind === 'transfer' || tx.transferGroupId !== null;
  const moneyIn = tx.direction === 'credit';
  const Icon = isTransfer ? ArrowLeftRight : moneyIn ? ArrowDownLeft : ArrowUpRight;
  const title = tx.merchant ?? (isTransfer ? 'Transfer' : (tx.category?.name ?? 'Transaction'));
  const detail = [isTransfer ? 'Transfer' : (tx.category?.name ?? 'Uncategorized'), tx.accountName]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.li
      custom={staggerIndex}
      variants={staggerIndex !== undefined ? staggerItemVariants : undefined}
      initial={staggerIndex !== undefined ? 'hidden' : undefined}
      animate={staggerIndex !== undefined ? 'visible' : undefined}
      className="relative flex items-center gap-3 px-5 py-3 sm:px-6"
    >
      {isNew && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: DURATION_HIGHLIGHT, ease: EASE_OUT_QUART }}
          className="pointer-events-none absolute inset-0 bg-accent"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          moneyIn && !isTransfer ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {detail}
          {showDate ? ` · ${formatInstantDay(tx.occurredAt)}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-end">
        <p className={cn('text-sm font-medium tabular-nums', moneyIn && !isTransfer && 'text-accent-foreground')}>
          <span className="sr-only">{moneyIn ? 'Money in: ' : 'Money out: '}</span>
          {formatMoney(tx.amount, tx.currency, moneyIn ? '+' : '-')}
        </p>
        {tx.original && (
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="sr-only">Charged as </span>
            {formatMoney(tx.original.amount, tx.original.currency)}
          </p>
        )}
      </div>
    </motion.li>
  );
}
