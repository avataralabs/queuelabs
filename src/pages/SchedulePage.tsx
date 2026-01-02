import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProfiles } from '@/hooks/useProfiles';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { TimelineGraph } from '@/components/schedule/TimelineGraph';
import { ScheduleSlotManager } from '@/components/schedule/ScheduleSlotManager';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar, Clock, Settings } from 'lucide-react';
import { subDays, addDays, startOfDay, isToday, parseISO } from 'date-fns';
import { Platform } from '@/types';

// Type untuk account item di dropdown
type AccountItem = {
  profileId: string;
  profileName: string;
  platform: Platform;
  username?: string;
};

export default function SchedulePage() {
  const [searchParams] = useSearchParams();
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [baseDate, setBaseDate] = useState(new Date());
  const [showSlotManager, setShowSlotManager] = useState(false);
  
  // Flatten profiles menjadi account items (1 connected account = 1 dropdown item)
  const accountItems = useMemo(() => {
    const items: AccountItem[] = [];
    
    profiles.forEach(profile => {
      if (profile.connected_accounts && profile.connected_accounts.length > 0) {
        // Tambah setiap connected account sebagai item terpisah
        profile.connected_accounts.forEach(acc => {
          if (['tiktok', 'instagram', 'youtube'].includes(acc.platform)) {
            items.push({
              profileId: profile.id,
              profileName: profile.name,
              platform: acc.platform as Platform,
              username: acc.username
            });
          }
        });
      } else {
        // Fallback: gunakan platform utama jika belum ada connected accounts
        items.push({
          profileId: profile.id,
          profileName: profile.name,
          platform: profile.platform,
          username: undefined
        });
      }
    });
    
    return items;
  }, [profiles]);
  
  // Parse selected value
  const selectedProfileId = selectedValue.split('|')[0];
  const selectedPlatform = selectedValue.split('|')[1] as Platform | undefined;
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  
  const { slots: profileSlots } = useScheduleSlots(selectedProfileId, selectedPlatform);
  
  // Set initial selection when loaded
  useEffect(() => {
    if (accountItems.length === 0) return;
    
    const profileParam = searchParams.get('profile');
    const platformParam = searchParams.get('platform');
    
    // Priority 1: URL params with profile + platform
    if (profileParam && platformParam) {
      const found = accountItems.find(
        item => item.profileId === profileParam && item.platform === platformParam
      );
      if (found) {
        setSelectedValue(`${found.profileId}|${found.platform}`);
        return; // Important: return after setting value from URL
      }
    }
    
    // Priority 2: URL param with profile only
    if (profileParam) {
      const found = accountItems.find(item => item.profileId === profileParam);
      if (found) {
        setSelectedValue(`${found.profileId}|${found.platform}`);
        return;
      }
    }
    
    // Priority 3: Default to first item ONLY if no selection yet
    if (!selectedValue) {
      const first = accountItems[0];
      setSelectedValue(`${first.profileId}|${first.platform}`);
    }
  }, [accountItems, searchParams]);
  
  // Handle date parameter separately
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const targetDate = parseISO(dateParam);
      if (!isNaN(targetDate.getTime())) {
        setBaseDate(targetDate);
      }
    }
  }, [searchParams]);
  
  // selectedProfile is already defined above
  
  // Generate 4 days: yesterday, today, tomorrow, day after
  const displayDates = useMemo(() => {
    const start = subDays(startOfDay(baseDate), 1);
    return Array.from({ length: 4 }, (_, i) => addDays(start, i));
  }, [baseDate]);
  
  const navigateDays = (direction: 'prev' | 'next') => {
    setBaseDate(prev => direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1));
  };
  
  const goToToday = () => {
    setBaseDate(new Date());
  };
  
  const activeSlots = profileSlots.filter(s => s.is_active);
  
  // Get URL params for auto-scroll and highlight
  const scrollToHour = searchParams.get('hour') ? parseInt(searchParams.get('hour')!) : null;
  const highlightContentId = searchParams.get('contentId');
  
  if (profilesLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Schedule</h1>
            <p className="text-muted-foreground">
              Manage your content posting schedule
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {selectedProfile && (
              <Button 
                variant="outline" 
                onClick={() => setShowSlotManager(!showSlotManager)}
              >
                <Settings className="w-4 h-4" />
                Manage Time Slots
              </Button>
            )}
          </div>
        </div>
        
        {profiles.length === 0 ? (
          <div className="glass rounded-xl border border-border p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No Profiles Yet</h2>
            <p className="text-muted-foreground mb-6">
              Create a profile first to manage schedules
            </p>
            <Button variant="glow" asChild>
              <a href="/profiles">Create Profile</a>
            </Button>
          </div>
        ) : (
          <>
            {/* Profile Selector & Navigation */}
            <div className="glass rounded-xl border border-border p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <Select value={selectedValue} onValueChange={setSelectedValue}>
                    <SelectTrigger className="w-[280px]">
                      {selectedProfile && selectedPlatform ? (
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={selectedPlatform} size="sm" showLabel={false} variant="icon" />
                          <span>{selectedProfile.name}</span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Select account" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {accountItems.map((item, index) => (
                        <SelectItem 
                          key={`${item.profileId}-${item.platform}-${index}`} 
                          value={`${item.profileId}|${item.platform}`}
                        >
                          <div className="flex items-center gap-2">
                            <PlatformBadge platform={item.platform} size="sm" showLabel={false} variant="icon" />
                            <span>{item.profileName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedProfile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>{activeSlots.length} active slots</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => navigateDays('prev')}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  
                  <Button 
                    variant={isToday(baseDate) ? "default" : "outline"} 
                    onClick={goToToday}
                    className="min-w-[100px]"
                  >
                    Today
                  </Button>
                  
                  <Button variant="outline" size="icon" onClick={() => navigateDays('next')}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Slot Manager */}
            {showSlotManager && selectedProfile && selectedPlatform && (
              <ScheduleSlotManager 
                profileId={selectedProfileId}
                platform={selectedPlatform}
                onClose={() => setShowSlotManager(false)}
              />
            )}
            
            {/* Timeline Graph */}
            {selectedProfile && selectedPlatform && (
              <TimelineGraph 
                profileId={selectedProfileId}
                platform={selectedPlatform}
                dates={displayDates}
                scrollToHour={scrollToHour}
                highlightContentId={highlightContentId}
              />
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
