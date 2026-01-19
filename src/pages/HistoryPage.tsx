import { useState, useMemo } from 'react';
import { useUploadHistory, UploadHistoryWithDetails, ConnectedAccount } from '@/hooks/useUploadHistory';
import { useProfiles, type Profile, type Platform } from '@/hooks/useProfiles';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';
import { useContents } from '@/hooks/useContents';
import { MainLayout } from '@/components/layout/MainLayout';
import { PlatformIcon } from '@/components/common/PlatformIcon';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { History, FileVideo, CheckCircle, XCircle, Filter, Loader2, Send, Clock } from 'lucide-react';
import { cn, formatUsername } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type SelectedSlot = {
  slotId: string;
  profileId: string;
  platform: string;
  accountUsername: string;
};

export default function HistoryPage() {
  const { history, isLoading } = useUploadHistory();
  const { profiles } = useProfiles();
  const { slots } = useScheduleSlots();
  const { addContent } = useContents();
  const { toast } = useToast();
  
  const [filterProfileId, setFilterProfileId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<UploadHistoryWithDetails | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  
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
  
  // Group slots by profile
  const profilesWithSlots = useMemo(() => {
    return profiles
      .filter(p => p.connected_accounts && p.connected_accounts.length > 0)
      .map(profile => ({
        profile,
        accounts: (profile.connected_accounts || []).map(acc => ({
          ...acc,
          slots: slots.filter(s => s.profile_id === profile.id && s.platform === acc.platform && s.is_active)
        })).filter(acc => acc.slots.length > 0)
      }))
      .filter(p => p.accounts.length > 0);
  }, [profiles, slots]);
  
  const openAssignDialog = (entry: UploadHistoryWithDetails) => {
    setSelectedEntry(entry);
    setSelectedSlots([]);
    setAssignDialogOpen(true);
  };
  
  const toggleSlot = (slotId: string, profileId: string, platform: string, accountUsername: string) => {
    setSelectedSlots(prev => {
      const exists = prev.find(s => s.slotId === slotId);
      if (exists) {
        return prev.filter(s => s.slotId !== slotId);
      }
      return [...prev, { slotId, profileId, platform, accountUsername }];
    });
  };
  
  const handleAssign = async () => {
    if (!selectedEntry?.contents || selectedSlots.length === 0) return;
    
    setIsAssigning(true);
    try {
      for (const slot of selectedSlots) {
        const slotData = slots.find(s => s.id === slot.slotId);
        if (!slotData) continue;
        
        await addContent.mutateAsync({
          file_name: selectedEntry.contents.file_name,
          file_url: selectedEntry.contents.file_url,
          platform: slot.platform,
          status: 'pending',
          assigned_profile_id: slot.profileId,
          scheduled_slot_id: slot.slotId
        });
      }
      
      toast({
        title: 'Content assigned',
        description: `Assigned to ${selectedSlots.length} slot(s) successfully`
      });
      setAssignDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Failed to assign',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setIsAssigning(false);
    }
  };
  
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
                    
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs",
                        entry.status === 'success' 
                          ? "bg-success/10 text-success" 
                          : "bg-destructive/10 text-destructive"
                      )}>
                        {entry.status === 'success' ? 'Uploaded' : 'Failed'}
                      </span>
                      
                      {entry.contents?.file_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAssignDialog(entry)}
                          className="gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Assign
                        </Button>
                      )}
                      
                      {entry.error_message && (
                        <p className="text-xs text-destructive max-w-[200px] truncate" title={entry.error_message}>
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
        
        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign to Schedule Slot</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 max-h-[400px] overflow-y-auto py-2">
              {selectedEntry?.contents && (
                <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                  <p className="text-sm font-medium truncate">{selectedEntry.contents.file_name}</p>
                </div>
              )}
              
              {profilesWithSlots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No active schedule slots available</p>
                  <p className="text-sm mt-1">Create schedule slots first</p>
                </div>
              ) : (
                profilesWithSlots.map(({ profile, accounts }) => (
                  <div key={profile.id} className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{profile.name}</p>
                    {accounts.map(account => (
                      <div key={`${profile.id}-${account.platform}`} className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <PlatformIcon platform={account.platform as Platform} size="sm" />
                          <span>{formatUsername(account.username)}</span>
                        </div>
                        <div className="pl-6 space-y-1">
                          {account.slots.map(slot => {
                            const isSelected = selectedSlots.some(s => s.slotId === slot.id);
                            return (
                              <label
                                key={slot.id}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors",
                                  isSelected ? "bg-primary/10" : "hover:bg-secondary/50"
                                )}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSlot(slot.id, profile.id, account.platform, account.username)}
                                />
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">
                                  {String(slot.hour).padStart(2, '0')}:{String(slot.minute).padStart(2, '0')}
                                  {slot.week_days && slot.week_days.length < 7 && (
                                    <span className="text-muted-foreground ml-1">
                                      ({slot.week_days.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')})
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAssign} 
                disabled={selectedSlots.length === 0 || isAssigning}
              >
                {isAssigning ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Assign ({selectedSlots.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
