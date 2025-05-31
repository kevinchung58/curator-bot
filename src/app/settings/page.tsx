import { PageTitle } from '@/components/PageTitle';
import { SettingsClientPage } from './SettingsClientPage';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings - Content Curator Bot',
  description: 'Configure your Content Curator Bot settings.',
};

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-2 sm:py-4">
      <PageTitle
        title="Settings"
        description="Manage your API keys and application preferences."
      />
      <SettingsClientPage />
    </div>
  );
}
