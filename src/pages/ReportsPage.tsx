import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  startOfDay, 
  startOfWeek, 
  startOfMonth, 
  endOfDay, 
  endOfWeek, 
  endOfMonth,
  isWithinInterval,
  format,
  subDays,
  subWeeks,
  subMonths
} from 'date-fns';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Period = 'daily' | 'weekly' | 'monthly';

export default function ReportsPage() {
  const { uploadHistory, profiles, scheduledContents, contents } = useAppStore();
  const [period, setPeriod] = useState<Period>('daily');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  
  const getDateRange = (p: Period) => {
    const now = new Date();
    switch (p) {
      case 'daily':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'weekly':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'monthly':
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };
  
  const getPreviousRange = (p: Period) => {
    const now = new Date();
    switch (p) {
      case 'daily':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'weekly':
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek), end: endOfWeek(lastWeek) };
      case 'monthly':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
  };
  
  const stats = useMemo(() => {
    const range = getDateRange(period);
    const prevRange = getPreviousRange(period);
    
    const filterByProfile = (items: typeof uploadHistory) => 
      selectedProfileId === 'all' 
        ? items 
        : items.filter(i => i.profileId === selectedProfileId);
    
    const currentHistory = filterByProfile(
      uploadHistory.filter(h => 
        isWithinInterval(new Date(h.uploadedAt), range)
      )
    );
    
    const prevHistory = filterByProfile(
      uploadHistory.filter(h => 
        isWithinInterval(new Date(h.uploadedAt), prevRange)
      )
    );
    
    const currentScheduled = scheduledContents.filter(sc => 
      (selectedProfileId === 'all' || sc.profileId === selectedProfileId) &&
      isWithinInterval(new Date(sc.scheduledDate), range)
    );
    
    const currentSuccess = currentHistory.filter(h => h.status === 'success').length;
    const currentFailed = currentHistory.filter(h => h.status === 'failed').length;
    const prevSuccess = prevHistory.filter(h => h.status === 'success').length;
    
    const successRate = currentHistory.length > 0 
      ? Math.round((currentSuccess / currentHistory.length) * 100) 
      : 0;
    
    const prevSuccessRate = prevHistory.length > 0
      ? Math.round((prevSuccess / prevHistory.length) * 100)
      : 0;
    
    const successTrend = successRate - prevSuccessRate;
    
    return {
      total: currentHistory.length,
      success: currentSuccess,
      failed: currentFailed,
      scheduled: currentScheduled.length,
      successRate,
      successTrend,
      prevTotal: prevHistory.length,
    };
  }, [uploadHistory, scheduledContents, period, selectedProfileId]);
  
  const periodLabel = {
    daily: 'Today',
    weekly: 'This Week',
    monthly: 'This Month',
  };
  
  // Generate mock chart data
  const chartData = useMemo(() => {
    const days = period === 'daily' ? 24 : period === 'weekly' ? 7 : 30;
    return Array.from({ length: days }, (_, i) => ({
      label: period === 'daily' 
        ? `${i.toString().padStart(2, '0')}:00`
        : period === 'weekly'
          ? format(subDays(new Date(), 6 - i), 'EEE')
          : format(subDays(new Date(), 29 - i), 'd'),
      success: Math.floor(Math.random() * 5),
      failed: Math.random() > 0.8 ? 1 : 0,
    }));
  }, [period]);
  
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Reports</h1>
            <p className="text-muted-foreground">
              Analytics and performance overview
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All profiles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Profiles</SelectItem>
                {profiles.map(profile => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                      {profile.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
                <Button
                  key={p}
                  variant={period === p ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPeriod(p)}
                  className="rounded-none"
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">{periodLabel[period]}</span>
              <Calendar className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground mt-1">Total Uploads</p>
            {stats.prevTotal > 0 && (
              <div className={cn(
                "flex items-center gap-1 mt-2 text-sm",
                stats.total >= stats.prevTotal ? "text-success" : "text-destructive"
              )}>
                {stats.total >= stats.prevTotal ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{Math.abs(stats.total - stats.prevTotal)} vs previous</span>
              </div>
            )}
          </div>
          
          <div className="glass rounded-xl border border-success/30 bg-success/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Successful</span>
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <p className="text-3xl font-bold text-success">{stats.success}</p>
            <p className="text-sm text-muted-foreground mt-1">Uploads</p>
          </div>
          
          <div className="glass rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Failed</span>
              <XCircle className="w-5 h-5 text-destructive" />
            </div>
            <p className="text-3xl font-bold text-destructive">{stats.failed}</p>
            <p className="text-sm text-muted-foreground mt-1">Uploads</p>
          </div>
          
          <div className="glass rounded-xl border border-primary/30 bg-primary/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <p className="text-3xl font-bold text-primary">{stats.successRate}%</p>
            <p className="text-sm text-muted-foreground mt-1">This {period.slice(0, -2)}</p>
            {stats.successTrend !== 0 && (
              <div className={cn(
                "flex items-center gap-1 mt-2 text-sm",
                stats.successTrend > 0 ? "text-success" : "text-destructive"
              )}>
                {stats.successTrend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{Math.abs(stats.successTrend)}% vs previous</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Chart */}
        <div className="glass rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Upload Activity
          </h3>
          
          <div className="h-[300px] flex items-end justify-between gap-1">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5" style={{ height: '250px' }}>
                  <div className="flex-1 flex flex-col justify-end">
                    {d.failed > 0 && (
                      <div 
                        className="w-full bg-destructive/60 rounded-t"
                        style={{ height: `${d.failed * 20}px` }}
                      />
                    )}
                    <div 
                      className="w-full bg-primary/60 rounded-t"
                      style={{ height: `${d.success * 20}px` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-center gap-6 mt-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary/60" />
              <span className="text-sm text-muted-foreground">Success</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-destructive/60" />
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
          </div>
        </div>
        
        {/* Scheduled Overview */}
        <div className="glass rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Scheduled Content ({stats.scheduled} this {period.slice(0, -2)})
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {profiles.slice(0, 3).map(profile => {
              const count = scheduledContents.filter(sc => sc.profileId === profile.id).length;
              return (
                <div key={profile.id} className="p-4 rounded-lg bg-secondary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                    <span className="font-medium">{profile.name}</span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-sm text-muted-foreground">scheduled posts</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
