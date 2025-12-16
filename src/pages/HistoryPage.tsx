import { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { History, FileVideo, CheckCircle, XCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HistoryPage() {
  const { uploadHistory, profiles, contents } = useAppStore();
  const [filterProfileId, setFilterProfileId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const filteredHistory = useMemo(() => {
    return uploadHistory
      .filter(h => filterProfileId === 'all' || h.profileId === filterProfileId)
      .filter(h => filterStatus === 'all' || h.status === filterStatus)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }, [uploadHistory, filterProfileId, filterStatus]);
  
  const getProfileById = (id: string) => profiles.find(p => p.id === id);
  const getContentById = (id: string) => contents.find(c => c.id === id);
  
  const stats = useMemo(() => ({
    total: uploadHistory.length,
    success: uploadHistory.filter(h => h.status === 'success').length,
    failed: uploadHistory.filter(h => h.status === 'failed').length,
  }), [uploadHistory]);
  
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Upload History</h1>
          <p className="text-muted-foreground">
            View past upload attempts and their status
          </p>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">Total Uploads</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="glass rounded-lg p-4 border border-success/30 bg-success/5">
            <p className="text-sm text-muted-foreground">Successful</p>
            <p className="text-2xl font-bold text-success">{stats.success}</p>
          </div>
          <div className="glass rounded-lg p-4 border border-destructive/30 bg-destructive/5">
            <p className="text-sm text-muted-foreground">Failed</p>
            <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
          </div>
        </div>
        
        {/* Filters */}
        <div className="glass rounded-xl border border-border p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span>Filter by:</span>
            </div>
            
            <Select value={filterProfileId} onValueChange={setFilterProfileId}>
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
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success" />
                    Success
                  </div>
                </SelectItem>
                <SelectItem value="failed">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Failed
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* History List */}
        <div className="glass rounded-xl border border-border p-6">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-semibold mb-2">No Upload History</h2>
              <p>Upload history will appear here after content is published</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map(entry => {
                const profile = getProfileById(entry.profileId);
                const content = getContentById(entry.contentId);
                
                return (
                  <div 
                    key={entry.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        entry.status === 'success' ? "bg-success/10" : "bg-destructive/10"
                      )}>
                        {entry.status === 'success' 
                          ? <CheckCircle className="w-5 h-5 text-success" />
                          : <XCircle className="w-5 h-5 text-destructive" />
                        }
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <FileVideo className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">
                            {content?.fileName || 'Unknown content'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {profile && (
                            <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                          )}
                          <span className="text-sm text-muted-foreground">
                            {profile?.name || 'Unknown profile'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs",
                        entry.status === 'success' 
                          ? "bg-success/10 text-success" 
                          : "bg-destructive/10 text-destructive"
                      )}>
                        {entry.status === 'success' ? 'Uploaded' : 'Failed'}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(entry.uploadedAt), 'MMM d, HH:mm')}
                      </p>
                      {entry.errorMessage && (
                        <p className="text-xs text-destructive mt-1">{entry.errorMessage}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
