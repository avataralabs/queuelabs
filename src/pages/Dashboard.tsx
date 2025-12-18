import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
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
  Upload, 
  Users, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock,
  Download,
  TrendingUp,
  TrendingDown,
  BarChart3
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isWithinInterval, subDays, subWeeks, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

type Period = 'daily' | 'weekly' | 'monthly';

export default function Dashboard() {
  const { profiles, contents, scheduledContents, uploadHistory } = useAppStore();
  const [period, setPeriod] = useState<Period>('daily');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  
  const pendingCount = contents.filter(c => c.status === 'pending').length;
  const scheduledCount = contents.filter(c => c.status === 'scheduled').length;
  const successCount = uploadHistory.filter(h => h.status === 'success').length;
  const failedCount = uploadHistory.filter(h => h.status === 'failed').length;
  
  const today = new Date();
  const todayScheduled = scheduledContents.filter(sc => 
    new Date(sc.scheduledDate).toDateString() === today.toDateString()
  );

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

  const handleExportPDF = () => {
    // Create report content
    const reportContent = `
QueueLabs Report - ${format(new Date(), 'MMMM d, yyyy')}
Period: ${period.charAt(0).toUpperCase() + period.slice(1)}
${selectedProfileId !== 'all' ? `Profile: ${profiles.find(p => p.id === selectedProfileId)?.name}` : 'All Profiles'}

Summary:
- Total Uploads: ${stats.total}
- Successful: ${stats.success}
- Failed: ${stats.failed}
- Success Rate: ${stats.successRate}%
- Scheduled: ${stats.scheduled}

Profiles:
${profiles.map(p => `- ${p.name} (${p.platform}): ${scheduledContents.filter(sc => sc.profileId === p.id).length} scheduled`).join('\n')}
    `;

    // Create and download file
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `queuelabs-report-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const periodLabel = {
    daily: 'Today',
    weekly: 'This Week',
    monthly: 'This Month',
  };
  
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
            <p className="text-muted-foreground text-sm">
              Overview and reports
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger className="w-[180px]">
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

            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Content"
            value={contents.length}
            icon={<Upload className="w-5 h-5" />}
            variant="primary"
          />
          <StatCard
            title="Active Profiles"
            value={profiles.length}
            icon={<Users className="w-5 h-5" />}
            variant="default"
          />
          <StatCard
            title="Scheduled Today"
            value={todayScheduled.length}
            icon={<Calendar className="w-5 h-5" />}
            variant="warning"
          />
          <StatCard
            title="Success Rate"
            value={uploadHistory.length > 0 
              ? `${Math.round((successCount / uploadHistory.length) * 100)}%`
              : 'N/A'
            }
            icon={<CheckCircle className="w-5 h-5" />}
            variant="success"
            trend={uploadHistory.length > 0 ? { value: 12, isPositive: true } : undefined}
          />
        </div>

        {/* Report Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{periodLabel[period]}</span>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Total Uploads</p>
            {stats.prevTotal > 0 && (
              <div className={cn(
                "flex items-center gap-1 mt-2 text-xs",
                stats.total >= stats.prevTotal ? "text-success" : "text-destructive"
              )}>
                {stats.total >= stats.prevTotal ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{Math.abs(stats.total - stats.prevTotal)} vs previous</span>
              </div>
            )}
          </div>
          
          <div className="glass rounded-xl border-success/20 bg-success/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Successful</span>
              <CheckCircle className="w-4 h-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-success">{stats.success}</p>
            <p className="text-sm text-muted-foreground">Uploads</p>
          </div>
          
          <div className="glass rounded-xl border-destructive/20 bg-destructive/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Failed</span>
              <XCircle className="w-4 h-4 text-destructive" />
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
            <p className="text-sm text-muted-foreground">Uploads</p>
          </div>
          
          <div className="glass rounded-xl border-primary/20 bg-primary/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">{stats.successRate}%</p>
            <p className="text-sm text-muted-foreground">This {period.slice(0, -2)}</p>
          </div>
        </div>
        
        {/* Chart */}
        <div className="glass rounded-xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Upload Activity
          </h3>
          
          <div className="h-[200px] flex items-end justify-between gap-1">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5" style={{ height: '170px' }}>
                  <div className="flex-1 flex flex-col justify-end">
                    {d.failed > 0 && (
                      <div 
                        className="w-full bg-destructive/60 rounded-t"
                        style={{ height: `${d.failed * 15}px` }}
                      />
                    )}
                    <div 
                      className="w-full bg-primary/60 rounded-t"
                      style={{ height: `${d.success * 15}px` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary/60" />
              <span className="text-xs text-muted-foreground">Success</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-destructive/60" />
              <span className="text-xs text-muted-foreground">Failed</span>
            </div>
          </div>
        </div>
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Content */}
          <div className="lg:col-span-2 glass rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Pending Content
            </h2>
            {contents.filter(c => c.status === 'pending').length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No pending content</p>
              </div>
            ) : (
              <div className="space-y-2">
                {contents
                  .filter(c => c.status === 'pending')
                  .slice(0, 5)
                  .map(content => (
                    <div 
                      key={content.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Upload className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm truncate max-w-[200px]">
                            {content.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(content.uploadedAt), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded text-xs bg-warning/10 text-warning">
                        Pending
                      </span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          
          {/* Profiles Overview */}
          <div className="glass rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Profiles
            </h2>
            {profiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No profiles yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {profiles.slice(0, 5).map(profile => (
                  <div 
                    key={profile.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{profile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {scheduledContents.filter(sc => sc.profileId === profile.id).length} scheduled
                      </p>
                    </div>
                    <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-primary">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-warning">{scheduledCount}</p>
            <p className="text-xs text-muted-foreground">Scheduled</p>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-success">{successCount}</p>
            <p className="text-xs text-muted-foreground">Uploaded</p>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-destructive">{failedCount}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}