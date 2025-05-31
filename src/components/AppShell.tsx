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
import { Logo } from '@/components/icons/Logo';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Home, Settings, BotMessageSquare, BookOpenCheck } from 'lucide-react';
import React from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  // Read sidebar state from cookie
  const [defaultOpen, setDefaultOpen] = React.useState(true);
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedState = document.cookie
        .split('; ')
        .find(row => row.startsWith('sidebar_state='))
        ?.split('=')[1];
      if (storedState) {
        setDefaultOpen(storedState === 'true');
      }
    }
  }, []);


  if (!mounted) {
    // Render skeleton or loading state on server/initial client render to avoid hydration mismatch
    return (
      <div className="flex min-h-svh w-full">
        <div className="hidden md:block w-[16rem] bg-muted p-4">
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
  
  return (
    <SidebarProvider defaultOpen={defaultOpen} collapsible="icon">
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
