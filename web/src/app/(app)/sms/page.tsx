import { MessageSquareText } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function SMSinboxPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="SMS inbox" description="Bank messages the server has read, and the few it needs your help with." />
      <EmptyState icon={MessageSquareText} title="The inbox is on its way">
        See which messages became transactions, re-read old ones after adding card digits, and pair the two halves of a transfer.
      </EmptyState>
    </div>
  );
}
