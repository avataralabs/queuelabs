import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { PlatformIcon } from '@/components/common/PlatformIcon';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfiles, Platform, ConnectedAccount } from '@/hooks/useProfiles';
import { useContents } from '@/hooks/useContents';
import { useScheduleSlots } from '@/hooks/useScheduleSlots';

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Upload, FileVideo, Trash2, Send, Calendar, CloudUpload, AlertCircle, Check } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SelectedSlot {
  profileId: string;
  slotId: string;
  platform: string;
  username: string;
  time: string;
  profilePicture?: string;
}

export default function ContentPage() {
  const navigate = useNavigate();
  
  // Use Supabase hooks for database
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const { contents, isLoading: contentsLoading, addContent, updateContent, deleteContent } = useContents();
  const { slots, isLoading: slotsLoading } = useScheduleSlots();
  
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [isFromTrash, setIsFromTrash] = useState(false);
  const [newContent, setNewContent] = useState({ fileName: '', caption: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('pending');
  
  // Multi-select state
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  
  const pendingContents = contents.filter(c => c.status === 'pending');
  const assignedContents = contents.filter(c => c.status === 'assigned' || c.status === 'scheduled');
  const removedContents = contents.filter(c => c.status === 'removed');
  
  const getProfileById = (id?: string | null) => profiles.find(p => p.id === id);
  
  // Get all active slots for a profile+platform combination
  const getSlotsByProfilePlatform = (profileId: string, platform: string) => {
    return slots.filter(s => 
      s.profile_id === profileId && 
      s.platform === platform && 
      s.is_active
    );
  };
  
  // Get all connected accounts across all profiles with their parent profile info and slots
  const getAllConnectedAccountsWithSlots = () => {
    const accountsWithSlots: Array<{
      profile: typeof profiles[0];
      account: ConnectedAccount;
      slot: typeof slots[0];
    }> = [];
    
    const accountsWithoutSlots: Array<{
      profile: typeof profiles[0];
      account: ConnectedAccount;
    }> = [];
    
    profiles.forEach(profile => {
      const connectedAccounts = profile.connected_accounts as ConnectedAccount[] || [];
      connectedAccounts.forEach(account => {
        const accountSlots = getSlotsByProfilePlatform(profile.id, account.platform);
        
        if (accountSlots.length > 0) {
          // Add each slot as a separate entry
          accountSlots.forEach(slot => {
            accountsWithSlots.push({
              profile,
              account,
              slot
            });
          });
        } else {
          accountsWithoutSlots.push({
            profile,
            account
          });
        }
      });
    });
    
    return { accountsWithSlots, accountsWithoutSlots };
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Cleanup previous preview URL
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      
      setSelectedFile(file);
      setNewContent(prev => ({ ...prev, fileName: file.name }));
      
      // Generate preview URL for video
      const url = URL.createObjectURL(file);
      setVideoPreviewUrl(url);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const clearPreview = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoPreviewUrl(null);
    setSelectedFile(null);
    setNewContent({ fileName: '', caption: '' });
  };

  const handleUpload = () => {
    if (!newContent.fileName.trim()) return;
    
    addContent.mutate({
      file_name: newContent.fileName,
      caption: newContent.caption || null,
      file_size: selectedFile?.size || 0,
      file_url: null,
      assigned_profile_id: null,
      scheduled_at: null,
      scheduled_slot_id: null,
      status: 'pending',
      removed_at: null,
      removed_from_profile_id: null
    });
    
    clearPreview();
    toast.success('Content added to queue');
  };
  
  const openAssignDialog = (contentId: string, fromTrash: boolean = false) => {
    setSelectedContentId(contentId);
    setIsFromTrash(fromTrash);
    setSelectedSlots([]); // Reset selections
    setAssignDialogOpen(true);
  };
  
  const toggleSlotSelection = (slot: SelectedSlot) => {
    setSelectedSlots(prev => {
      const exists = prev.find(s => s.slotId === slot.slotId);
      if (exists) {
        return prev.filter(s => s.slotId !== slot.slotId);
      } else {
        return [...prev, slot];
      }
    });
  };
  
  const isSlotSelected = (slotId: string) => {
    return selectedSlots.some(s => s.slotId === slotId);
  };
  
  // Find next available date for a specific slot (for auto-assign)
  const findNextAvailableDateForSlot = (slotId: string): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return today;
    
    // Get all dates that already have content assigned to this slot
    const occupiedDates = contents
      .filter(c => c.scheduled_slot_id === slotId && (c.status === 'assigned' || c.status === 'scheduled'))
      .map(c => {
        if (!c.scheduled_at) return null;
        const d = new Date(c.scheduled_at);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
      .filter(Boolean);
    
    // Find the first available date starting from today
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() + i);
      
      // For weekly slots, check if this day of week is active
      if (slot.type === 'weekly' && slot.week_days) {
        if (!slot.week_days.includes(checkDate.getDay())) {
          continue;
        }
      }
      
      const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
      if (!occupiedDates.includes(dateKey)) {
        return checkDate;
      }
    }
    
    return today; // fallback
  };
  
  const handleMultiAssign = async () => {
    if (!selectedContentId || selectedSlots.length === 0) return;
    
    const originalContent = contents.find(c => c.id === selectedContentId);
    if (!originalContent) return;
    
    // Process each selected slot
    for (let i = 0; i < selectedSlots.length; i++) {
      const slotData = selectedSlots[i];
      const slot = slots.find(s => s.id === slotData.slotId);
      
      // Find next available date for this slot
      const scheduledDate = findNextAvailableDateForSlot(slotData.slotId);
      scheduledDate.setHours(slot?.hour || 0, slot?.minute || 0, 0, 0);
      
      if (i === 0) {
        // First slot: update original content
        updateContent.mutate({
          id: selectedContentId,
          assigned_profile_id: slotData.profileId,
          scheduled_slot_id: slotData.slotId,
          scheduled_at: scheduledDate.toISOString(),
          status: 'assigned',
          removed_at: null,
          removed_from_profile_id: null
        });
      } else {
        // Additional slots: create duplicate content
        addContent.mutate({
          file_name: originalContent.file_name,
          caption: originalContent.caption,
          file_size: originalContent.file_size,
          file_url: originalContent.file_url,
          assigned_profile_id: slotData.profileId,
          scheduled_slot_id: slotData.slotId,
          scheduled_at: scheduledDate.toISOString(),
          status: 'assigned',
          removed_at: null,
          removed_from_profile_id: null
        });
      }
    }
    
    toast.success(`Content assigned to ${selectedSlots.length} slot${selectedSlots.length > 1 ? 's' : ''}`);
    
    setAssignDialogOpen(false);
    setSelectedContentId(null);
    setSelectedSlots([]);
    setIsFromTrash(false);
  };
  
  const handleAssignedContentClick = (content: typeof assignedContents[0]) => {
    if (content.assigned_profile_id) {
      navigate(`/schedule?profile=${content.assigned_profile_id}`);
    }
  };
  
  const handleDeleteContent = (contentId: string) => {
    // Move to trash (set status to removed)
    const content = contents.find(c => c.id === contentId);
    if (content) {
      updateContent.mutate({
        id: contentId,
        status: 'removed',
        removed_at: new Date().toISOString(),
        removed_from_profile_id: content.assigned_profile_id
      });
      toast.success('Content moved to trash');
    }
  };
  
  const handlePermanentDelete = (contentId: string) => {
    deleteContent.mutate(contentId);
    toast.success('Content permanently deleted');
  };

  const isLoading = profilesLoading || contentsLoading || slotsLoading;
  const { accountsWithSlots, accountsWithoutSlots } = getAllConnectedAccountsWithSlots();
  
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Content</h1>
          <p className="text-muted-foreground text-sm">
            Upload and manage your video content
          </p>
        </div>
        
        {/* Upload Section - Main/Large */}
        <div className="glass rounded-xl p-8">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="video/*"
            className="hidden"
          />
          
          {selectedFile && videoPreviewUrl ? (
            <div className="space-y-6">
              {/* Video Preview - 16:9 aspect ratio container - clickable */}
              <div 
                className="relative w-full max-w-2xl mx-auto cursor-pointer group" 
                style={{ aspectRatio: '16/9' }}
                onClick={handleUploadClick}
              >
                <div className="absolute inset-0 bg-black rounded-xl overflow-hidden">
                  <video
                    src={videoPreviewUrl}
                    className="w-full h-full object-contain pointer-events-none"
                    muted
                  />
                </div>
                
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                  <Upload className="w-12 h-12 mb-2" />
                  <p className="font-medium">Click to change video</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Caption</label>
                <Textarea
                  placeholder="Write your caption here..."
                  rows={3}
                  value={newContent.caption}
                  onChange={(e) => setNewContent(prev => ({ ...prev, caption: e.target.value }))}
                  className="resize-none max-w-2xl mx-auto"
                />
              </div>
              
              <div className="flex gap-3 justify-center">
                <Button onClick={handleUpload} variant="default">
                  <Upload className="w-4 h-4" />
                  Add to Queue
                </Button>
                <Button variant="outline" onClick={clearPreview}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div 
              onClick={handleUploadClick}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
            >
              <CloudUpload className="w-16 h-16 mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Click to upload video</h3>
              <p className="text-muted-foreground text-sm">or drag & drop your video file here</p>
            </div>
          )}
        </div>
        
        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending" className="gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" />
              Pending
              <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-xs">
                {pendingContents.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="assigned" className="gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              Assigned
              <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-xs">
                {assignedContents.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="trash" className="gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Trash
              <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-xs">
                {removedContents.length}
              </span>
            </TabsTrigger>
          </TabsList>
          
          {/* Pending Tab */}
          <TabsContent value="pending" className="mt-4">
            <div className="glass rounded-xl p-4">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Loading...</p>
                </div>
              ) : pendingContents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileVideo className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No pending content</p>
                  <p className="text-sm">Upload videos to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingContents.map(content => (
                    <div 
                      key={content.id}
                      className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                            <FileVideo className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate" title={content.file_name}>
                              {content.file_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(content.uploaded_at), 'MMM d, yyyy HH:mm')}
                            </p>
                            {content.caption && (
                              <p className="text-sm text-muted-foreground truncate mt-1">
                                {content.caption}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => openAssignDialog(content.id)}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Assign
                          </Button>
                          <Button 
                            size="icon-sm" 
                            variant="ghost"
                            onClick={() => handleDeleteContent(content.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          
          {/* Assigned Tab */}
          <TabsContent value="assigned" className="mt-4">
            <div className="glass rounded-xl p-4">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Loading...</p>
                </div>
              ) : assignedContents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No assigned content</p>
                  <p className="text-sm">Assign pending content to profiles</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignedContents.map(content => {
                    const profile = getProfileById(content.assigned_profile_id);
                    const contentSlot = slots.find(s => s.id === content.scheduled_slot_id);
                    const slotTime = contentSlot 
                      ? `${String(contentSlot.hour).padStart(2, '0')}:${String(contentSlot.minute).padStart(2, '0')}`
                      : null;
                    
                    // Get platform from slot (not profile) for correct icon
                    const slotPlatform = contentSlot?.platform;
                    
                    // Get connected account for profile picture - use slot platform
                    const connectedAccount = profile?.connected_accounts?.find(
                      (acc: ConnectedAccount) => acc.platform === (slotPlatform || profile.platform)
                    ) as ConnectedAccount | undefined;
                    
                    // Format scheduled date if available
                    const scheduledDate = content.scheduled_at 
                      ? format(new Date(content.scheduled_at), 'MMM d')
                      : null;
                    
                    return (
                      <div 
                        key={content.id}
                        onClick={() => handleAssignedContentClick(content)}
                        className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {connectedAccount?.profile_picture ? (
                              <img 
                                src={connectedAccount.profile_picture} 
                                alt={connectedAccount.username}
                                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                {slotPlatform ? (
                                  <PlatformIcon platform={slotPlatform as Platform} className="w-5 h-5" />
                                ) : profile ? (
                                  <PlatformIcon platform={profile.platform as Platform} className="w-5 h-5" />
                                ) : (
                                  <FileVideo className="w-5 h-5 text-primary" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate" title={content.file_name}>
                                {content.file_name}
                              </p>
                              {(profile || slotPlatform) && (
                                <div className="flex items-center gap-2 mt-1">
                                  <PlatformIcon platform={(slotPlatform || profile?.platform) as Platform} className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">@{connectedAccount?.username || profile?.name}</span>
                                  {slotTime && (
                                    <span className="text-sm text-muted-foreground">• {slotTime}</span>
                                  )}
                                  {scheduledDate && (
                                    <span className="text-sm text-muted-foreground">• {scheduledDate}</span>
                                  )}
                                </div>
                              )}
                              {/* Caption - same as Pending tab */}
                              {content.caption && (
                                <p className="text-sm text-muted-foreground truncate mt-1">
                                  {content.caption}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium flex-shrink-0",
                            content.status === 'scheduled' 
                              ? "bg-primary/10 text-primary" 
                              : "bg-warning/10 text-warning"
                          )}>
                            {content.status === 'scheduled' ? 'Scheduled' : 'Assigned'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4 text-center">
                💡 Click on assigned content to go to schedule
              </p>
            </div>
          </TabsContent>
          
          {/* Trash Tab */}
          <TabsContent value="trash" className="mt-4">
            <div className="glass rounded-xl p-4 border border-orange-200 bg-orange-50/50">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Loading...</p>
                </div>
              ) : removedContents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">Trash is empty</p>
                  <p className="text-sm">Removed content will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {removedContents.map(content => {
                    const profile = content.removed_from_profile_id 
                      ? getProfileById(content.removed_from_profile_id) 
                      : null;
                    return (
                      <div 
                        key={content.id}
                        className="p-4 rounded-lg bg-white hover:bg-orange-50 transition-colors group border border-orange-100"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileVideo className="w-5 h-5 text-orange-600 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate" title={content.file_name}>
                                {content.file_name}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {profile && (
                                  <>
                                    <span>Removed from:</span>
                                    <PlatformBadge platform={profile.platform as Platform} size="sm" showLabel={false} />
                                    <span>{profile.name}</span>
                                  </>
                                )}
                                {content.removed_at && (
                                  <span className="ml-2">
                                    • {format(new Date(content.removed_at), 'MMM d, HH:mm')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => openAssignDialog(content.id, true)}
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Assign
                            </Button>
                            <Button 
                              size="icon-sm" 
                              variant="ghost"
                              onClick={() => handlePermanentDelete(content.id)}
                              title="Delete permanently"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Assign Dialog - Multi-Select with checkboxes */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Assign to Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {accountsWithSlots.length === 0 && accountsWithoutSlots.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No connected accounts yet. Connect your social media accounts first.
                  </p>
                  <Button variant="outline" onClick={() => navigate('/profiles')}>
                    Go to Profiles
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {/* Accounts with slots - each slot is a separate row with checkbox */}
                  {accountsWithSlots.map(({ profile, account, slot }) => {
                    const slotKey = slot.id;
                    const isSelected = isSlotSelected(slotKey);
                    const slotData: SelectedSlot = {
                      profileId: profile.id,
                      slotId: slot.id,
                      platform: account.platform,
                      username: account.username,
                      time: `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`,
                      profilePicture: account.profile_picture
                    };
                    
                    return (
                      <div
                        key={`${profile.id}-${account.platform}-${slot.id}`}
                        onClick={() => toggleSlotSelection(slotData)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors",
                          isSelected 
                            ? "bg-primary/10 border-2 border-primary" 
                            : "hover:bg-secondary border-2 border-transparent"
                        )}
                      >
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleSlotSelection(slotData)}
                          className="pointer-events-none"
                        />
                        {account.profile_picture ? (
                          <img 
                            src={account.profile_picture} 
                            alt={account.username}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                            <PlatformIcon platform={account.platform as Platform} className="w-5 h-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={account.platform as Platform} className="w-4 h-4" />
                            <span className="font-medium">@{account.username}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {profile.name}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-primary">
                          {String(slot.hour).padStart(2, '0')}:{String(slot.minute).padStart(2, '0')}
                        </span>
                        {isSelected && (
                          <Check className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Accounts without slots - disabled */}
                  {accountsWithoutSlots.map(({ profile, account }) => (
                    <div
                      key={`${profile.id}-${account.platform}-no-slot`}
                      className="flex items-center gap-3 p-4 rounded-lg transition-colors opacity-50 cursor-not-allowed bg-secondary/30"
                    >
                      <Checkbox disabled className="pointer-events-none" />
                      {account.profile_picture ? (
                        <img 
                          src={account.profile_picture} 
                          alt={account.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                          <PlatformIcon platform={account.platform as Platform} className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={account.platform as Platform} className="w-4 h-4" />
                          <span className="font-medium">@{account.username}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {profile.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-warning text-xs">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>No time slots</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer with selected count and assign button */}
            {(accountsWithSlots.length > 0 || accountsWithoutSlots.length > 0) && (
              <DialogFooter className="flex items-center justify-between sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedSlots.length} selected
                </span>
                <Button 
                  onClick={handleMultiAssign}
                  disabled={selectedSlots.length === 0}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Assign{selectedSlots.length > 0 ? ` to ${selectedSlots.length}` : ''}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
