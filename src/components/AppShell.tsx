
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/SiteHeader';
import { BotMessageSquare, Home, Settings } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import React from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isClient, setIsClient] = React.useState(false);
  // For SSR and initial client render before cookie is checked, assume 'true'.
  // This value will be updated *before* SidebarProvider is rendered on the client.
  const [initialSidebarStateFromCookie, setInitialSidebarStateFromCookie] = React.useState(true); 

  React.useEffect(() => {
    // This effect runs only on the client.
    const storedState = document.cookie
      .split('; ')
      .find(row => row.startsWith('sidebar_state='))
      ?.split('=')[1];
    if (storedState) {
      setInitialSidebarStateFromCookie(storedState === 'true');
    }
    // After determining the sidebar state from cookie (or using default), mark as client-rendered.
    setIsClient(true); 
  }, []); // Empty dependency array: runs once on mount.

  if (!isClient) {
    // Server-Side Rendering or initial client render before useEffect completes.
    // Render a skeleton that matches the assumed initial state (sidebar open).
    return (
      <div className="flex min-h-svh w-full">
        <div className="hidden md:block w-[16rem] bg-muted p-4"> {/* Corresponds to open sidebar */}
          <div className="flex items-center gap-2 mb-4">
             <BotMessageSquare className="h-8 w-8 text-primary" />
            <span className="font-headline text-xl">Curator Bot</span>
          </div>
          <SidebarMenuSkeleton showIcon />
          <SidebarMenuSkeleton showIcon />
        </div>
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b bg-background/80 px-4 sm:h-16 sm:px-6 flex items-center">
            <span className="font-headline text-xl">Content Curator Bot</span>
          </div>
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    );
  }
  
  // Now isClient is true, and initialSidebarStateFromCookie is set.
  // SidebarProvider will receive the cookie-derived state from its first render on the client.
  return (
    <SidebarProvider defaultOpen={initialSidebarStateFromCookie} collapsible="icon">
      <Sidebar_ variant="sidebar" side="left">
        <SidebarHeader className="border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base text-sidebar-foreground hover:text-sidebar-primary transition-colors">
            <BotMessageSquare className="h-8 w-8" />
            <span className="font-headline text-xl group-data-[collapsible=icon]:hidden">Curator Bot</span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <ScrollArea className="h-full">
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={{ children: item.label, side: 'right', className: "ml-2" }}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="p-2 border-t border-sidebar-border">
           {/* Footer content if needed */}
        </SidebarFooter>
      </Sidebar_>
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Renaming Sidebar to Sidebar_ to avoid conflict with the imported Sidebar from shadcn/ui
// This is a workaround if the context provider and component have the same name.
// It's better to ensure unique names or use aliases during import.
const Sidebar_ = Sidebar;
