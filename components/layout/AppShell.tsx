"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  ClipboardList,
  IndianRupee,
  Settings,
  Menu,
  X,
  ChevronDown,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canAccessPath, type PermissionMap } from "@/lib/nav-access";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { HelpDrawer } from "@/components/layout/HelpDrawer";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: { label: string; href: string; hint?: string }[];
  /** Shown only to staff who see just their own employee record (Gap #47). */
  ownOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    label: "Clients",
    href: "/dashboard/clients",
    icon: <Users className="size-4" />,
    children: [
      { label: "Directory", href: "/dashboard/clients", hint: "Everyone we work for" },
      { label: "Onboarding Pipeline", href: "/dashboard/clients/onboarding", hint: "New clients being set up" },
      { label: "Client Groups", href: "/dashboard/clients/groups", hint: "Families and related companies" },
    ],
  },
  // Gap #82 (decided 12 Oct): six groups instead of a long list. Nothing is renamed or
  // removed and every page keeps its address; roles still see only what they can open.
  {
    label: "Work",
    href: "/dashboard/engagements",
    icon: <ClipboardList className="size-4" />,
    children: [
      { label: "Engagements", href: "/dashboard/engagements", hint: "All the jobs we are doing" },
      { label: "Tasks", href: "/dashboard/tasks", hint: "Your to-do list" },
      { label: "Compliance", href: "/dashboard/compliance", hint: "What is due and when" },
    ],
  },
  {
    label: "People",
    href: "/dashboard/employees",
    icon: <Briefcase className="size-4" />,
    children: [
      { label: "Employee Directory", href: "/dashboard/employees", hint: "Who works here" },
      { label: "Employee Onboarding", href: "/dashboard/employees/onboarding", hint: "New staff being set up" },
      { label: "My profile", href: "/dashboard/employees/me", hint: "Your own details" },
      { label: "Payroll", href: "/dashboard/payroll", hint: "Is salary ready to release?" },
    ],
  },
  {
    label: "Money",
    href: "/dashboard/billing",
    icon: <IndianRupee className="size-4" />,
    children: [
      { label: "Billing", href: "/dashboard/billing", hint: "Raise and track bills" },
      { label: "Finance", href: "/dashboard/finance", hint: "Spending and cash" },
      { label: "Reports", href: "/dashboard/reports", hint: "Numbers for partners" },
    ],
  },
  {
    label: "Setup",
    href: "/dashboard/settings",
    icon: <Settings className="size-4" />,
    children: [
      { label: "Services", href: "/dashboard/service-types", hint: "The work we offer" },
      { label: "Libraries", href: "/dashboard/libraries", hint: "Standard steps for each job" },
      { label: "Settings", href: "/dashboard/settings", hint: "Rules and options" },
    ],
  },
];

function NavLink({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const hasChildren = item.children && item.children.length > 0;
  const matching = (item.children ?? []).filter(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
  );
  // The most specific page wins, so "Employee Directory" is not lit while on "My profile".
  const activeChildHref = matching.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  // The group holding the page you are on starts open.
  const [open, setOpen] = useState(matching.length > 0);

  if (hasChildren) {
    const isGroupActive = isActive || matching.length > 0;
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isGroupActive
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-3">
            {item.icon}
            {item.label}
          </span>
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="ml-7 mt-1 space-y-1">
            {item.children!.map((child) => {
              const childActive = child.href === activeChildHref;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onClick}
                  className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                    childActive
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent/10 text-accent"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

/** FR-03: keep only the menu entries this role can open. */
function visibleNavItems(permissions: PermissionMap): NavItem[] {
  const out: NavItem[] = [];
  for (const item of NAV_ITEMS) {
    if (item.ownOnly) {
      if (permissions.view_own_employee === true && permissions.view_employees !== true) out.push(item);
      continue;
    }
    if (item.children && item.children.length > 0) {
      const children = item.children.filter((c) => canAccessPath(c.href, permissions));
      // A group with one usable page is just a plain link, with no dropdown.
      if (children.length === 1) out.push({ ...item, href: children[0].href, children: undefined });
      else if (children.length > 1) out.push({ ...item, children });
    } else if (canAccessPath(item.href, permissions)) {
      out.push(item);
    }
  }
  return out;
}

function NoAccess() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="rounded-md border bg-card p-6 max-w-lg">
        <h1 className="text-lg font-semibold text-foreground">No access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role does not have access to this page. Ask a Managing Partner or Admin if you
          need it.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function SidebarContent({
  onItemClick,
  permissions,
}: {
  onItemClick?: () => void;
  permissions: PermissionMap;
}) {
  const pathname = usePathname();
  const navItems = visibleNavItems(permissions);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Building2 className="size-6 text-accent" />
          <span className="text-sm font-bold tracking-tight text-foreground">
            CMA Practice Manager
          </span>
        </Link>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            return (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive}
                onClick={onItemClick}
              />
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

/** Menu across the top bar. Each group opens a list with a one-line explanation of every page. */
function TopNav({ permissions }: { permissions: PermissionMap }) {
  const pathname = usePathname();
  const items = visibleNavItems(permissions);
  const base = "flex h-14 items-center gap-1.5 border-b-[3px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
  const here = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav aria-label="Main menu" className="hidden items-stretch gap-0.5 md:flex">
      {items.map((item) => {
        const matching = (item.children ?? []).filter((c) => here(c.href));
        const activeChildHref = matching.sort((a, b) => b.href.length - a.href.length)[0]?.href;
        const active = item.children ? matching.length > 0 : item.href === "/dashboard" ? pathname === "/dashboard" : here(item.href);
        const cls = `${base} ${active ? "border-[hsl(var(--cta))] text-white" : "border-transparent text-white/80 hover:bg-white/10 hover:text-white"}`;

        if (!item.children) {
          return (
            <Link key={item.href} href={item.href} className={cls} aria-current={active ? "page" : undefined}>
              {item.icon}
              {item.label}
            </Link>
          );
        }
        return (
          <DropdownMenu key={item.href}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cls}>
                {item.icon}
                {item.label}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {item.children.map((c) => (
                <DropdownMenuItem key={c.href} asChild>
                  <Link href={c.href} className="flex cursor-pointer flex-col items-start gap-0">
                    <span className={`text-sm ${c.href === activeChildHref ? "font-semibold text-accent" : "font-medium"}`}>{c.label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}

/** "managing_partner" becomes "Managing Partner"; custom role names are tidied the same way. */
function roleLabel(name?: string | null): string | null {
  if (!name) return null;
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppShell({
  children,
  permissions,
  roleName,
}: {
  children: React.ReactNode;
  permissions: PermissionMap;
  roleName?: string | null;
}) {
  const role = roleLabel(roleName);
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageAllowed = canAccessPath(pathname, permissions);
  const settingsAllowed = canAccessPath("/dashboard/settings", permissions);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* UI Version 3: navy top bar with the menu across it (the six groups are unchanged) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[hsl(var(--header))] px-4 text-[hsl(var(--header-foreground))]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white md:hidden">
                  <Menu className="size-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-60 p-0">
                <SidebarContent
                  permissions={permissions}
                  onItemClick={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-white">
              <span className="flex size-8 items-center justify-center rounded-md bg-white text-xs font-bold text-[hsl(var(--header))]">CMA</span>
              <span className="hidden font-heading text-base font-semibold lg:inline">Practice Manager</span>
            </Link>
            <TopNav permissions={permissions} />
          </div>

          <div className="flex items-center gap-1 [&_button:hover]:bg-white/15 [&_button:hover]:text-white [&_button]:text-white">
            <HelpDrawer />
            <ThemeToggle />
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto gap-3 px-3 py-1.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                    {session?.user?.name
                      ? session.user.name.charAt(0).toUpperCase()
                      : session?.user?.email?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                  <span className="hidden flex-col items-start text-left leading-tight sm:flex">
                    <span className="max-w-[14rem] truncate text-[15px] font-semibold text-white">
                      {session?.user?.name ?? session?.user?.email ?? "User"}
                    </span>
                    <span className="text-xs font-normal text-white/85">{role ?? "No role"}</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {session?.user?.name ?? session?.user?.email ?? "User"}
                  </p>
                  <p className="text-xs text-muted-foreground">Role: {role ?? "none"}</p>
                </div>
                <DropdownMenuSeparator />
                {settingsAllowed && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/settings">Settings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/security">Security</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <SignOutButton
                    callbackUrl="/login"
                    className="w-full cursor-pointer justify-start text-sm"
                  >
                    Sign out
                  </SignOutButton>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {pageAllowed ? children : <NoAccess />}
        </main>
      </div>
    </div>
  );
}
