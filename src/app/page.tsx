import { PageTitle } from '@/components/PageTitle';
import { StrategySection } from '@/components/dashboard/StrategySection';
import { DiscoveredContentSection } from '@/components/dashboard/DiscoveredContentSection';
import { Separator } from '@/components/ui/separator';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-2 sm:py-4">
      <PageTitle
        title="Content Curation Dashboard"
        description="Manage your content curation workflow, from strategy to processing."
      />
      <div className="space-y-8">
        <StrategySection />
        <Separator />
        <DiscoveredContentSection />
      </div>
    </div>
  );
}
