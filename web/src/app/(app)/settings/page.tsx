import { Settings } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Connect your phone and manage the devices that send bank SMS." />
      <EmptyState icon={Settings} title="Settings are on their way">
        Create a device key for your phone’s SMS forwarder, see when each device last sent a message, and revoke old ones.
      </EmptyState>
    </div>
  );
}
