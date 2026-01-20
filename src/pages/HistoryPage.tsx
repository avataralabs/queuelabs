import { useState, useMemo, useCallback } from 'react';
import { useUploadHistory, UploadHistoryWithDetails, ConnectedAccount } from '@/hooks/useUploadHistory';
import { useProfiles, type Profile, type Platform } from '@/hooks/useProfiles';
import { useScheduleSlots, type ScheduleSlot } from '@/hooks/useScheduleSlots';
import { useContents } from '@/hooks/useContents';
import { useScheduledContents } from '@/hooks/useScheduledContents';
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
import { format, addDays, startOfDay } from 'date-fns';
import { History, CheckCircle, XCircle, Filter, Loader2, Send, Clock, Calendar } from 'lucide-react';
import { cn, formatUsername } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type SelectedPlatform = {
  platform: string;
  profileId: string;
  profileName: string;
  accountUsername: string;
};

// WIB timezone utilities
const getNowWib = () => {
  const now = new Date();
  // Convert to WIB (UTC+7)
  const wibOffset = 7 * 60;
  const utcOffset = now.getTimezoneOffset();
  return new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000);
};

const wibToUtc = (date: Date): Date => {
  const wibOffset = 7 * 60;
  return new Date(date.getTime() - wibOffset * 60 * 1000);
};

interface NextAvailableSlot {
  slotId: string;
  profileId: string;
  scheduledAt: Date; // UTC
  displayDate: Date; // WIB for display
  hour: number;
  minute: number;
}

export default function HistoryPage() {
  const { history, isLoading } = useUploadHistory();
  const { profiles } = useProfiles();
  const { slots } = useScheduleSlots();
  const { addContent, contents } = useContents(['pending', 'scheduled', 'assigned']);
  const { scheduledContents } = useScheduledContents();
  const { toast } = useToast();
  
  const [filterProfileId, setFilterProfileId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<UploadHistoryWithDetails | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<SelectedPlatform[]>([]);
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

  // Build a map of occupied slot-dates
  const occupiedSlotDates = useMemo(() => {
    const map = new Map<string, Set<string>>(); // slotId -> Set of date strings (YYYY-MM-DD)
    
    // From contents table (pending/scheduled/assigned)
    contents?.forEach(c => {
      if (c.scheduled_slot_id && c.scheduled_at) {
        const dateStr = format(new Date(c.scheduled_at), 'yyyy-MM-dd');
        if (!map.has(c.scheduled_slot_id)) {
          map.set(c.scheduled_slot_id, new Set());
        }
        map.get(c.scheduled_slot_id)!.add(dateStr);
      }
    });
    
    // From scheduled_contents table
    scheduledContents?.forEach(sc => {
      const dateStr = format(new Date(sc.scheduled_date), 'yyyy-MM-dd');
      if (!map.has(sc.slot_id)) {
        map.set(sc.slot_id, new Set());
      }
      map.get(sc.slot_id)!.add(dateStr);
    });
    
    return map;
  }, [contents, scheduledContents]);

  // Find next available slot for a platform/profile combination
  const findNextAvailableSlot = useCallback((
    platformSlots: ScheduleSlot[],
    nowWib: Date
  ): NextAvailableSlot | null => {
    if (platformSlots.length === 0) return null;

    // Sort slots by hour:minute
    const sortedSlots = [...platformSlots].sort((a, b) => {
      if (a.hour !== b.hour) return a.hour - b.hour;
      return a.minute - b.minute;
    });

    // Check up to 365 days ahead
    for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
      const checkDate = addDays(startOfDay(nowWib), dayOffset);
      const dayOfWeek = checkDate.getDay();

      for (const slot of sortedSlots) {
        // Check weekly slot days
        if (slot.type === 'weekly' && slot.week_days) {
          if (!slot.week_days.includes(dayOfWeek)) continue;
        }

        // Create slot datetime in WIB
        const slotDateTimeWib = new Date(checkDate);
        slotDateTimeWib.setHours(slot.hour, slot.minute, 0, 0);

        // Skip if slot time has passed today
        if (dayOffset === 0 && nowWib >= slotDateTimeWib) continue;

        // Check if slot+date is occupied
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        const occupiedDates = occupiedSlotDates.get(slot.id);
        if (occupiedDates?.has(dateStr)) continue;

        // Found available slot!
        return {
          slotId: slot.id,
          profileId: slot.profile_id,
          scheduledAt: wibToUtc(slotDateTimeWib),
          displayDate: slotDateTimeWib,
          hour: slot.hour,
          minute: slot.minute
        };
      }
    }

    return null;
  }, [occupiedSlotDates]);

  // Group by platform with next available slot info
  const platformOptions = useMemo(() => {
    const nowWib = getNowWib();
    const options: {
      platform: string;
      profileId: string;
      profileName: string;
      accountUsername: string;
      accountPicture?: string;
      slotCount: number;
      nextSlot: NextAvailableSlot | null;
    }[] = [];

    profiles.forEach(profile => {
      if (!profile.connected_accounts) return;
      
      profile.connected_accounts.forEach((acc: ConnectedAccount) => {
        const platformSlots = slots.filter(
          s => s.profile_id === profile.id && 
               s.platform === acc.platform && 
               s.is_active
        );
        
        if (platformSlots.length === 0) return;

        const nextSlot = findNextAvailableSlot(platformSlots, nowWib);
        
        options.push({
          platform: acc.platform,
          profileId: profile.id,
          profileName: profile.name,
          accountUsername: acc.username,
          accountPicture: acc.profile_picture,
          slotCount: platformSlots.length,
          nextSlot
        });
      });
    });

    // Sort by platform, then by profile name
    return options.sort((a, b) => {
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.profileName.localeCompare(b.profileName);
    });
  }, [profiles, slots, findNextAvailableSlot]);
  
  const openAssignDialog = (entry: UploadHistoryWithDetails) => {
    setSelectedEntry(entry);
    setSelectedPlatforms([]);
    setAssignDialogOpen(true);
  };
  
  const togglePlatform = (option: typeof platformOptions[0]) => {
    setSelectedPlatforms(prev => {
      const key = `${option.profileId}-${option.platform}`;
      const exists = prev.find(p => `${p.profileId}-${p.platform}` === key);
      if (exists) {
        return prev.filter(p => `${p.profileId}-${p.platform}` !== key);
      }
      return [...prev, {
        platform: option.platform,
        profileId: option.profileId,
        profileName: option.profileName,
        accountUsername: option.accountUsername
      }];
    });
  };
  
  const handleAssign = async () => {
    if (!selectedEntry?.contents || selectedPlatforms.length === 0) return;
    
    setIsAssigning(true);
    const nowWib = getNowWib();
    let successCount = 0;
    
    try {
      for (const selection of selectedPlatforms) {
        // Get slots for this platform/profile
        const platformSlots = slots.filter(
          s => s.profile_id === selection.profileId && 
               s.platform === selection.platform && 
               s.is_active
        );
        
        // Find next available slot
        const nextSlot = findNextAvailableSlot(platformSlots, nowWib);
        
        if (!nextSlot) {
          toast({
            title: `No slot available`,
            description: `No available slot for ${formatUsername(selection.accountUsername)}`,
            variant: 'destructive'
          });
          continue;
        }
        
        await addContent.mutateAsync({
          file_name: selectedEntry.contents.file_name,
          file_url: selectedEntry.contents.file_url,
          platform: selection.platform,
          status: 'pending',
          assigned_profile_id: nextSlot.profileId,
          scheduled_slot_id: nextSlot.slotId,
          scheduled_at: nextSlot.scheduledAt.toISOString()
        });
        
        successCount++;
      }
      
      if (successCount > 0) {
        toast({
          title: 'Content assigned',
          description: `Assigned to ${successCount} slot(s) successfully`
        });
      }
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
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate max-w-[200px] sm:max-w-[300px] md:max-w-[400px]">
                          {content?.file_name || 'Unknown content'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs flex-shrink-0",
                            entry.status === 'success' 
                              ? "bg-success/10 text-success" 
                              : "bg-destructive/10 text-destructive"
                          )}>
                            {entry.status === 'success' ? 'Uploaded' : 'Failed'}
                          </span>
                          {contentPlatform && (
                            <>
                              <PlatformIcon platform={contentPlatform as Platform} className="w-4 h-4" />
                              <span>
                                {formatUsername(connectedAccount?.username || profile?.name || '')}
                              </span>
                            </>
                          )}
                          <span>
                            {contentPlatform ? '• ' : ''}{format(new Date(entry.uploaded_at), 'MMM d, HH:mm')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {entry.contents?.file_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignDialog(entry)}
                          className="gap-1.5"
                        >
                          <Send className="w-4 h-4" />
                          Assign
                        </Button>
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
              <DialogTitle>Auto Assign to Platform</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 max-h-[400px] overflow-y-auto py-2">
              {selectedEntry?.contents && (
                <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                  <p className="text-sm font-medium truncate">{selectedEntry.contents.file_name}</p>
                </div>
              )}
              
              {platformOptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No active schedule slots available</p>
                  <p className="text-sm mt-1">Create schedule slots first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {platformOptions.map(option => {
                    const key = `${option.profileId}-${option.platform}`;
                    const isSelected = selectedPlatforms.some(
                      p => `${p.profileId}-${p.platform}` === key
                    );
                    
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                          isSelected 
                            ? "bg-primary/10 border-primary/30" 
                            : "hover:bg-secondary/50 border-border"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => togglePlatform(option)}
                        />
                        
                        {option.accountPicture ? (
                          <img 
                            src={option.accountPicture} 
                            alt={option.accountUsername}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                            <PlatformIcon platform={option.platform as Platform} className="w-4 h-4" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={option.platform as Platform} size="sm" />
                            <span className="font-medium text-sm">
                              {formatUsername(option.accountUsername)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <span>{option.profileName}</span>
                            <span>•</span>
                            <span>{option.slotCount} slots</span>
                          </div>
                        </div>
                        
                        {option.nextSlot ? (
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              <span>{format(option.nextSlot.displayDate, 'MMM d')}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-medium">
                              <Clock className="w-3 h-3" />
                              <span>
                                {String(option.nextSlot.hour).padStart(2, '0')}:
                                {String(option.nextSlot.minute).padStart(2, '0')}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No slot</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAssign} 
                disabled={selectedPlatforms.length === 0 || isAssigning}
              >
                {isAssigning ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Assign ({selectedPlatforms.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
