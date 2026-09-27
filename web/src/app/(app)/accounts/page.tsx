import { Wallet } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function AccountsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Accounts" description="Your cards and bank accounts, each with its available balance." />
      <EmptyState icon={Wallet} title="Accounts arrive in the next update">
        Add a card or bank account with the last 4 digits its SMS use, and every matching message lands in the right place.
      </EmptyState>
    </div>
  );
}
