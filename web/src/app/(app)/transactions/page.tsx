import { ArrowLeftRight } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function TransactionsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Transactions" description="Every expense, income and transfer, newest first." />
      <EmptyState icon={ArrowLeftRight} title="Transactions arrive in the next update">
        Filter by account, category and date. Foreign charges show both the original price and what your card was charged.
      </EmptyState>
    </div>
  );
}
