import { useState } from 'react';
import { Moon, Sun, Key, LogOut, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';

export function Header() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRoles();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleAdminNavigation = () => {
    setTimeout(() => {
      navigate('/admin');
    }, 100);
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex justify-end items-center gap-3 p-4 bg-background/80 backdrop-blur-sm border-b border-border">
        {/* Theme Toggle - Circular */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </Button>

        {/* Profile Avatar - Circular */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <User className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
            <DropdownMenuLabel className="font-normal py-3">
              <p className="text-sm font-medium truncate">
                {user?.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            {isAdmin && (
              <DropdownMenuItem 
                className="cursor-pointer py-2.5"
                onSelect={handleAdminNavigation}
              >
                <Settings className="w-4 h-4 mr-3" />
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              className="cursor-pointer py-2.5"
              onClick={() => setChangePasswordOpen(true)}
            >
              <Key className="w-4 h-4 mr-3" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem 
              className="cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <ChangePasswordDialog 
        open={changePasswordOpen} 
        onOpenChange={setChangePasswordOpen} 
      />
    </>
  );
}
