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
import { subDays, addDays, startOfDay, isToday } from 'date-fns';

export default function SchedulePage() {
  const [searchParams] = useSearchParams();
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [baseDate, setBaseDate] = useState(new Date());
  const [showSlotManager, setShowSlotManager] = useState(false);
  
  const { slots: profileSlots } = useScheduleSlots(selectedProfileId);
  
  // Set initial profile when loaded
  useEffect(() => {
    if (profiles.length > 0 && !selectedProfileId) {
      const profileParam = searchParams.get('profile');
      if (profileParam && profiles.some(p => p.id === profileParam)) {
        setSelectedProfileId(profileParam);
      } else {
        setSelectedProfileId(profiles[0].id);
      }
    }
  }, [profiles, selectedProfileId, searchParams]);
  
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  
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
                  <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder="Select profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id}>
                          <div className="flex items-center gap-2">
                            <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                            <span>{profile.name}</span>
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
            {showSlotManager && selectedProfile && (
              <ScheduleSlotManager 
                profileId={selectedProfileId} 
                onClose={() => setShowSlotManager(false)}
              />
            )}
            
            {/* Timeline Graph */}
            {selectedProfile && (
              <TimelineGraph 
                profileId={selectedProfileId}
                dates={displayDates}
              />
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
