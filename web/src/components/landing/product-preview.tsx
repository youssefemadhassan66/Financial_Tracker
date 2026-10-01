'use client';

import { motion } from 'motion/react';
import { ArrowDown, ArrowUpRight, MessageSquareText } from 'lucide-react';
import { CountUp } from '@/components/motion/count-up';
import { GrowBar } from '@/components/motion/grow-bar';
import { EASE_OUT_QUART } from '@/components/motion/motion-tokens';
import { formatMoney } from '@/lib/format';

// FAKE demo data only (card 1111, TEST merchants), per the project's data rules.
const categories = [
  { name: 'Groceries', total: '3200.00', share: 38 },
  { name: 'Food & Dining', total: '1840.50', share: 22 },
  { name: 'Transport', total: '1430.00', share: 17 },
  { name: 'Subscriptions', total: '649.99', share: 8 },
];

/**
 * The hero visual: the product's one trick, shown rather than told. A bank
 * SMS arrives and becomes a filed transaction next to the month's spending.
 * Purely illustrative, so it is hidden from assistive tech and described by
 * the surrounding copy instead.
 */
export function ProductPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none lg:max-w-none">
      {/* The month panel */}
      <div className="rounded-3xl border bg-card p-6 pb-12 shadow-[0_24px_60px_-30px_oklch(0.3_0.08_280/0.3)]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Spent in September</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">EGP</span>
        </div>
        <p className="mt-2 font-heading text-4xl font-semibold tracking-tight">
          <CountUp amount="8450.00" currency="EGP" />
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">7% more than August</span> (EGP 7,900.00)
        </p>
        <ul className="mt-6 space-y-3.5">
          {categories.map((c) => (
            <li key={c.name}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="tabular-nums">{formatMoney(c.total, 'EGP')}</span>
              </div>
              <GrowBar share={c.share} className="mt-1.5" />
            </li>
          ))}
        </ul>
      </div>

      {/* The SMS turning into a transaction: sequenced once, ~1.6s total */}
      <div className="relative -mt-6 ms-6 me-2 space-y-2 sm:ms-10 lg:-ms-10 lg:me-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.75, ease: EASE_OUT_QUART }}
          className="flex max-w-[19rem] gap-2.5 rounded-2xl rounded-bl-md border bg-background p-3.5 text-[0.8rem] leading-snug shadow-lg"
        >
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            <span className="font-semibold">TESTBANK</span>
            <br />
            Card ending 1111 was charged EGP 149.99 at TEST STREAM.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 1.05, ease: EASE_OUT_QUART }}
        >
          <ArrowDown className="ms-8 size-4 text-muted-foreground" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 1.25, ease: EASE_OUT_QUART }}
          className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-lg"
        >
          <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground">
            <ArrowUpRight className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">TEST STREAM</p>
            <p className="text-xs text-muted-foreground">Subscriptions · Test Visa · just now</p>
          </div>
          <p className="text-sm font-medium tabular-nums">{formatMoney('149.99', 'EGP', '-')}</p>
        </motion.div>
      </div>
    </div>
  );
}
