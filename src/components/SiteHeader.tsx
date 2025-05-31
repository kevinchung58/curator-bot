import Link from 'next/link';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/icons/Logo';
import { Settings, UserCircle } from 'lucide-react';

export function SiteHeader() {
  const { isMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md sm:h-16 sm:px-6">
      {isMobile && <SidebarTrigger />}
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base">
        <Logo className="h-6 w-6 text-primary" />
        <span className="font-headline text-xl">Content Curator Bot</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
          </Link>
        </Button>
        {/* Placeholder for user profile, if authentication is added later */}
        {/* <Button variant="ghost" size="icon">
          <UserCircle className="h-5 w-5" />
          <span className="sr-only">User Profile</span>
        </Button> */}
      </div>
    </header>
  );
}
