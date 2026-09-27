import { Repeat } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function SubscriptionsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Subscriptions" description="Recurring charges: what they cost per month and year, and when each is due." />
      <EmptyState icon={Repeat} title="Subscriptions are on their way">
        Repeating charges are spotted automatically. You get a heads-up when a price changes or an expected charge doesn’t show up.
      </EmptyState>
    </div>
  );
}
