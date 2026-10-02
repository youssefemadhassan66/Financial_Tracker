'use client';

import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { PageHeader } from '@/components/page-header';
import { AccountSection } from '@/components/settings/account-section';
import { ConnectedPhones } from '@/components/settings/connected-phones';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Connect your phone and manage your account." />
      <Stagger className="space-y-6">
        <StaggerItem index={0}>
          <ConnectedPhones />
        </StaggerItem>
        <StaggerItem index={1}>
          <AccountSection />
        </StaggerItem>
      </Stagger>
    </div>
  );
}
