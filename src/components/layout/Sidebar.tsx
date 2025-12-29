import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Upload, 
  Users, 
  Calendar, 
  History,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: Upload, label: 'Content' },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/profiles', icon: Users, label: 'Profiles' },
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/history', icon: History, label: 'History' },
];

export function Sidebar() {
  const location = useLocation();
  
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-sidebar-foreground">QueueLabs</h1>
            <p className="text-xs text-sidebar-foreground/60">Auto Upload System</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-200",
                !isActive && "group-hover:scale-110"
              )} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}