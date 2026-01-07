import { useState, useMemo } from 'react';
import { useUploadHistory, UploadHistoryWithDetails, ConnectedAccount } from '@/hooks/useUploadHistory';
import { useProfiles } from '@/hooks/useProfiles';
import { MainLayout } from '@/components/layout/MainLayout';
import { PlatformIcon } from '@/components/common/PlatformIcon';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { History, FileVideo, CheckCircle, XCircle, Filter, Loader2 } from 'lucide-react';
import { cn, formatUsername } from '@/lib/utils';
import type { Platform } from '@/hooks/useProfiles';

export default function HistoryPage() {
  const { history, isLoading } = useUploadHistory();
  const { profiles } = useProfiles();
  const [filterProfileId, setFilterProfileId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const filteredHistory = useMemo(() => {
    return history
      .filter(h => filterProfileId === 'all' || h.profile_id === filterProfileId)
      .filter(h => filterStatus === 'all' || h.status === filterStatus);
  }, [history, filterProfileId, filterStatus]);
  
  const stats = useMemo(() => ({
    total: history.length,
    success: history.filter(h => h.status === 'success').length,
    failed: history.filter(h => h.status === 'failed').length,
  }), [history]);
  
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
                      <PlatformIcon platform={profile.platform as Platform} size="sm" />
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-semibold mb-2">No Upload History</h2>
              <p>Upload history will appear here after content is published</p>
            </div>
          ) : (
            <div className="space-y-3">
            {filteredHistory.map(entry => {
                const profile = entry.profiles;
                const content = entry.contents;
                
                // Platform: prioritas content.platform > profile.platform
                const contentPlatform = content?.platform || profile?.platform;
                
                // Get connected account berdasarkan content platform
                const connectedAccount = profile?.connected_accounts?.find(
                  (acc: ConnectedAccount) => acc.platform === contentPlatform
                );
                
                return (
                  <div 
                    key={entry.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {connectedAccount?.profile_picture ? (
                        <img 
                          src={connectedAccount.profile_picture} 
                          alt={connectedAccount.username}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                          entry.status === 'success' ? "bg-success/10" : "bg-destructive/10"
                        )}>
                          {contentPlatform ? (
                            <PlatformIcon platform={contentPlatform as Platform} className="w-5 h-5" />
                          ) : entry.status === 'success' ? (
                            <CheckCircle className="w-5 h-5 text-success" />
                          ) : (
                            <XCircle className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                      )}
                      
                      <div>
                        <p className="font-medium">
                          {content?.file_name || 'Unknown content'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {contentPlatform && (
                            <>
                              <PlatformIcon platform={contentPlatform as Platform} className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {formatUsername(connectedAccount?.username || profile?.name || '')}
                              </span>
                            </>
                          )}
                          <span className="text-sm text-muted-foreground">
                            • {format(new Date(entry.uploaded_at), 'MMM d, HH:mm')}
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
                      {entry.error_message && (
                        <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={entry.error_message}>
                          {entry.error_message}
                        </p>
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
