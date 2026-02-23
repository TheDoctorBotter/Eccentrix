'use client';

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
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentClinic, memberships, signOut, setCurrentClinic } = useAuth();

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
        return <Stethoscope className="h-3 w-3" />;
      case 'pta':
        return <UserCog className="h-3 w-3" />;
      case 'front_office':
        return <Briefcase className="h-3 w-3" />;
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
      case 'front_office':
        return 'Front Office';
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
      case 'front_office':
        return 'bg-slate-100 text-slate-700 border-slate-200';
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
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Eccentrix EMR" className="h-8 w-8 rounded-lg object-contain" />
              <span className="font-bold text-xl text-slate-900">Eccentrix EMR</span>
            </Link>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/">
                <Button
                  variant={isActive('/') && !isActive('/settings') && !isActive('/charts') && !isActive('/archived') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <Home className="h-4 w-4" />
                  Home
                </Button>
              </Link>
              <Link href="/archived">
                <Button
                  variant={isActive('/archived') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <Archive className="h-4 w-4" />
                  Archived
                </Button>
              </Link>
              <Link href="/settings">
                <Button
                  variant={isActive('/settings') ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </nav>
          </div>

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
