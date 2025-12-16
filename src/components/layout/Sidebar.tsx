import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Upload, 
  Users, 
  Calendar, 
  History, 
  BarChart3,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/content', icon: Upload, label: 'Content' },
  { path: '/profiles', icon: Users, label: 'Profiles' },
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/history', icon: History, label: 'History' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
];

export function Sidebar() {
  const location = useLocation();
  
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">QueueLabs</h1>
            <p className="text-xs text-muted-foreground">Auto Upload System</p>
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
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-200",
                isActive ? "text-primary" : "group-hover:scale-110"
              )} />
              <span className="font-medium">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </NavLink>
          );
        })}
      </nav>
      
      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="glass rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Storage Used</p>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-primary rounded-full" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">2.4 GB / 10 GB</p>
        </div>
      </div>
    </aside>
  );
}
