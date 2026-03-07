'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Home,
  Archive,
  Settings,
  ChevronDown,
  Building2,
  User,
  LogOut,
  Shield,
  Stethoscope,
  UserCog,
  Briefcase,
  Plus,
  Calendar,
  Target,
  DollarSign,
  Dumbbell,
  BarChart3,
  FileSignature,
  MessageSquare,
  Menu,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentClinic, memberships, signOut, setCurrentClinic, hasRole, isEmrMode } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const canSeeFrontOffice = hasRole(['admin', 'front_office', 'pt', 'ot', 'slp']);
  const canSeeBilling = hasRole(['admin', 'biller', 'front_office']);
  const canSeeCosign = hasRole(['admin', 'pt', 'pta', 'ot', 'ota', 'slp', 'slpa']);
  const canSeeReports = hasRole(['admin', 'pt', 'ot', 'slp']);
  const canSeeSettings = hasRole(['admin']);
  const canSeeClinical = hasRole(['admin', 'pt', 'pta', 'ot', 'ota', 'slp', 'slpa']);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/sign-in');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-3 w-3" />;
      case 'pt':
      case 'ot':
      case 'slp':
        return <Stethoscope className="h-3 w-3" />;
      case 'pta':
      case 'ota':
      case 'slpa':
        return <UserCog className="h-3 w-3" />;
      case 'front_office':
        return <Briefcase className="h-3 w-3" />;
      case 'biller':
        return <DollarSign className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'pt':
        return 'PT';
      case 'pta':
        return 'PTA';
      case 'ot':
        return 'OT';
      case 'ota':
        return 'OTA';
      case 'slp':
        return 'SLP';
      case 'slpa':
        return 'SLPA';
      case 'front_office':
        return 'Front Office';
      case 'biller':
        return 'Biller';
      default:
        return role;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'pt':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'pta':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'ot':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'ota':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'slp':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'slpa':
        return 'bg-pink-100 text-pink-700 border-pink-200';
      case 'front_office':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'biller':
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const handleClinicSwitch = (membership: typeof memberships[0]) => {
    setCurrentClinic(membership);
    toast.success(`Switched to ${membership.clinic_name}`, {
      description: `You are now viewing ${membership.clinic_name} as ${getRoleLabel(membership.role)}`,
    });
  };

  return (
    <>
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex py-1 items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Eccentrix EMR" className="h-20 object-contain" />
            </Link>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 flex-wrap">
              {canSeeFrontOffice && (
                <Link href="/front-office">
                  <Button
                    variant={isActive('/front-office') ? 'secondary' : 'ghost'}
                    size="sm"
                    className="gap-1.5 text-xs"
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    Front Office
                  </Button>
                </Link>
              )}
              <Link href="/">
                <Button
                  variant={isActive('/') && !isActive('/settings') && !isActive('/charts') && !isActive('/archived') && !isActive('/front-office') && !isActive('/schedule') && !isActive('/billing') && !isActive('/reports') && !isActive('/exercises') && !isActive('/goals') && !isActive('/outcome-measures') && !isActive('/cosign') && !isActive('/messages') && !isActive('/hep') && !isActive('/audit') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Home className="h-3.5 w-3.5" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/schedule">
                <Button
                  variant={isActive('/schedule') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Schedule
                </Button>
              </Link>
              {canSeeClinical && isEmrMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isActive('/goals') || isActive('/outcome-measures') || isActive('/exercises') || isActive('/hep') ? 'secondary' : 'ghost'}
                    size="sm"
                    className="gap-1.5 text-xs"
                  >
                    <Target className="h-3.5 w-3.5" />
                    Clinical
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link href="/goals" className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Goals (STG/LTG)
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/outcome-measures" className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Outcome Measures
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/exercises" className="flex items-center gap-2">
                      <Dumbbell className="h-4 w-4" />
                      Exercise Library
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/hep" className="flex items-center gap-2">
                      <Dumbbell className="h-4 w-4" />
                      HEP Programs
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
              {canSeeBilling && (
              <Link href="/billing">
                <Button
                  variant={isActive('/billing') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Billing
                </Button>
              </Link>
              )}
              {canSeeCosign && isEmrMode && (
              <Link href="/cosign">
                <Button
                  variant={isActive('/cosign') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <FileSignature className="h-3.5 w-3.5" />
                  Co-Sign
                </Button>
              </Link>
              )}
              <Link href="/messages">
                <Button
                  variant={isActive('/messages') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Messages
                </Button>
              </Link>
              {canSeeReports && (
              <Link href="/reports">
                <Button
                  variant={isActive('/reports') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Reports
                </Button>
              </Link>
              )}
              {canSeeSettings && (
              <Link href="/settings">
                <Button
                  variant={isActive('/settings') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Button>
              </Link>
              )}
              <Link href="/archived">
                <Button
                  variant={isActive('/archived') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archived
                </Button>
              </Link>
            </nav>
          </div>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="text-left text-sm font-semibold">Navigation</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col py-2">
                {canSeeFrontOffice && (
                  <Link href="/front-office" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/front-office') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                    <Briefcase className="h-4 w-4" />
                    Front Office
                  </Link>
                )}
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/') && !isActive('/settings') && !isActive('/charts') && !isActive('/archived') && !isActive('/front-office') && !isActive('/schedule') && !isActive('/billing') && !isActive('/reports') && !isActive('/exercises') && !isActive('/goals') && !isActive('/outcome-measures') && !isActive('/cosign') && !isActive('/messages') && !isActive('/hep') && !isActive('/audit') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Home className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link href="/schedule" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/schedule') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Calendar className="h-4 w-4" />
                  Schedule
                </Link>

                {canSeeClinical && isEmrMode && (
                <>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Clinical</span>
                </div>
                <Link href="/goals" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/goals') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Target className="h-4 w-4" />
                  Goals (STG/LTG)
                </Link>
                <Link href="/outcome-measures" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/outcome-measures') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <BarChart3 className="h-4 w-4" />
                  Outcome Measures
                </Link>
                <Link href="/exercises" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/exercises') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Dumbbell className="h-4 w-4" />
                  Exercise Library
                </Link>
                <Link href="/hep" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/hep') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Dumbbell className="h-4 w-4" />
                  HEP Programs
                </Link>
                </>
                )}

                <div className="my-1 border-t" />

                {canSeeBilling && (
                <Link href="/billing" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/billing') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <DollarSign className="h-4 w-4" />
                  Billing
                </Link>
                )}
                {canSeeCosign && isEmrMode && (
                <Link href="/cosign" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/cosign') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <FileSignature className="h-4 w-4" />
                  Co-Sign
                </Link>
                )}
                <Link href="/messages" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/messages') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </Link>
                {canSeeReports && (
                <Link href="/reports" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/reports') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <BarChart3 className="h-4 w-4" />
                  Reports
                </Link>
                )}

                <div className="my-1 border-t" />

                {canSeeSettings && (
                <Link href="/settings" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/settings') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                )}
                <Link href="/archived" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isActive('/archived') ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                  <Archive className="h-4 w-4" />
                  Archived
                </Link>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Right side - Clinic Switcher and Account */}
          <div className="flex items-center gap-3">
            {/* Clinic Switcher - always visible */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline max-w-[150px] truncate">
                      {currentClinic?.clinic_name || 'Select Clinic'}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Switch Clinic</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {memberships.map((membership) => (
                    <DropdownMenuItem
                      key={membership.id}
                      onClick={() => handleClinicSwitch(membership)}
                      className={currentClinic?.id === membership.id ? 'bg-slate-100' : ''}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>{membership.clinic_name}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getRoleBadgeColor(membership.role)}`}
                        >
                          {getRoleLabel(membership.role)}
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings/clinic">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Clinic
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Account Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {user?.email ? user.email.split('@')[0] : 'Account'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-2">
                    <p className="text-sm font-medium leading-none">
                      {user?.email || 'Not signed in'}
                    </p>
                    {currentClinic && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs gap-1 ${getRoleBadgeColor(currentClinic.role)}`}
                          >
                            {getRoleIcon(currentClinic.role)}
                            {getRoleLabel(currentClinic.role)}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {currentClinic.clinic_name}
                        </p>
                      </div>
                    )}
                  </div>
                </DropdownMenuLabel>

                {memberships.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-slate-500 font-normal">
                      Switch Clinic
                    </DropdownMenuLabel>
                    {memberships.map((membership) => (
                      <DropdownMenuItem
                        key={membership.id}
                        onClick={() => handleClinicSwitch(membership)}
                        className={currentClinic?.id === membership.id ? 'bg-slate-100' : ''}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            <span className="text-sm">{membership.clinic_name}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getRoleBadgeColor(membership.role)}`}
                          >
                            {getRoleLabel(membership.role)}
                          </Badge>
                        </div>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/settings/clinic">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Clinic
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
    <div className="w-full border-b bg-slate-50 py-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end">
        <span className="text-[10px] text-slate-400">Powered by PTBot</span>
      </div>
    </div>
    </>
  );
}
