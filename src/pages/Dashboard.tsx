import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { Upload, Users, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const { profiles, contents, scheduledContents, uploadHistory } = useAppStore();
  
  const pendingCount = contents.filter(c => c.status === 'pending').length;
  const scheduledCount = contents.filter(c => c.status === 'scheduled').length;
  const successCount = uploadHistory.filter(h => h.status === 'success').length;
  const failedCount = uploadHistory.filter(h => h.status === 'failed').length;
  
  // Get today's scheduled content
  const today = new Date();
  const todayScheduled = scheduledContents.filter(sc => 
    new Date(sc.scheduledDate).toDateString() === today.toDateString()
  );
  
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your content queue and upload status
          </p>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Content"
            value={contents.length}
            icon={<Upload className="w-6 h-6" />}
            variant="primary"
          />
          <StatCard
            title="Active Profiles"
            value={profiles.length}
            icon={<Users className="w-6 h-6" />}
            variant="default"
          />
          <StatCard
            title="Scheduled Today"
            value={todayScheduled.length}
            icon={<Calendar className="w-6 h-6" />}
            variant="warning"
          />
          <StatCard
            title="Upload Success Rate"
            value={uploadHistory.length > 0 
              ? `${Math.round((successCount / uploadHistory.length) * 100)}%`
              : 'N/A'
            }
            icon={<CheckCircle className="w-6 h-6" />}
            variant="success"
            trend={uploadHistory.length > 0 ? { value: 12, isPositive: true } : undefined}
          />
        </div>
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Content */}
          <div className="lg:col-span-2 glass rounded-xl border border-border p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Pending Content
            </h2>
            {contents.filter(c => c.status === 'pending').length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Upload className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No pending content</p>
                <p className="text-sm">Upload videos to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contents
                  .filter(c => c.status === 'pending')
                  .slice(0, 5)
                  .map(content => (
                    <div 
                      key={content.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Upload className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium truncate max-w-[200px]">
                            {content.fileName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(content.uploadedAt), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs bg-warning/10 text-warning">
                        Pending
                      </span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          
          {/* Profiles Overview */}
          <div className="glass rounded-xl border border-border p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Profiles
            </h2>
            {profiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No profiles yet</p>
                <p className="text-sm">Create a profile to start scheduling</p>
              </div>
            ) : (
              <div className="space-y-3">
                {profiles.slice(0, 5).map(profile => (
                  <div 
                    key={profile.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{profile.name}</p>
                      <p className="text-sm text-muted-foreground">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass rounded-lg p-4 border border-border text-center">
            <p className="text-2xl font-bold text-primary">{pendingCount}</p>
            <p className="text-sm text-muted-foreground">Pending</p>
          </div>
          <div className="glass rounded-lg p-4 border border-border text-center">
            <p className="text-2xl font-bold text-warning">{scheduledCount}</p>
            <p className="text-sm text-muted-foreground">Scheduled</p>
          </div>
          <div className="glass rounded-lg p-4 border border-border text-center">
            <p className="text-2xl font-bold text-success">{successCount}</p>
            <p className="text-sm text-muted-foreground">Uploaded</p>
          </div>
          <div className="glass rounded-lg p-4 border border-border text-center">
            <p className="text-2xl font-bold text-destructive">{failedCount}</p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
