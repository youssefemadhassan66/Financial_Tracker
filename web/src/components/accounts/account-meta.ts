import { CreditCard, Landmark, PiggyBank, Wallet } from 'lucide-react';
import type { AccountType } from '@/lib/api/types';

export const typeLabel: Record<AccountType, string> = {
  checking: 'Current account',
  savings: 'Savings',
  cash: 'Cash',
  wallet: 'Wallet',
  credit_card: 'Credit card',
  brokerage: 'Brokerage',
};

export const typeIcon: Record<AccountType, typeof Wallet> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Wallet,
  wallet: Wallet,
  credit_card: CreditCard,
  brokerage: Landmark,
};

export const ALL_ACCOUNT_TYPES: AccountType[] = [
  'checking',
  'savings',
  'cash',
  'wallet',
  'credit_card',
  'brokerage',
];
