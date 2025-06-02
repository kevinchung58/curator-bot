
import { PageTitle } from '@/components/PageTitle';
import { StrategySection } from '@/components/dashboard/StrategySection';
import { DiscoveredContentSection } from '@/components/dashboard/DiscoveredContentSection';
import { Separator } from '@/components/ui/separator';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-2 sm:py-4">
      <PageTitle
        title="Content Curation Dashboard"
        description="Manage your content curation workflow, from strategy to processing."
      />
      <div className="space-y-8">
        <ErrorBoundary fallbackMessage="Could not load the search strategy formulation section.">
          <StrategySection />
        </ErrorBoundary>
        <Separator />
        <ErrorBoundary fallbackMessage="Could not load the discovered content section. Please check your connection or try refreshing.">
          <DiscoveredContentSection />
        </ErrorBoundary>
      </div>
    </div>
  );
}
