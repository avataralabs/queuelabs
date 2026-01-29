import { useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlatformIcon } from "@/components/common/PlatformIcon";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfiles, Platform, ConnectedAccount } from "@/hooks/useProfiles";
import { useContents } from "@/hooks/useContents";
import { useScheduleSlots, type ScheduleSlot } from "@/hooks/useScheduleSlots";
import { useScheduledContents } from "@/hooks/useScheduledContents";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileVideo, Trash2, Send, Calendar, CloudUpload, Clock, Loader2 } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { cn, formatUsername } from "@/lib/utils";
import { toast } from "sonner";

type SelectedPlatform = {
  platform: string;
  profileId: string;
  profileName: string;
  accountUsername: string;
};

// WIB timezone utilities
const getNowWib = () => {
  const now = new Date();
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
  scheduledAt: Date;
  displayDate: Date;
  hour: number;
  minute: number;
}

export default function ContentPage() {
  const navigate = useNavigate();

  // Use Supabase hooks for database
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const { contents, isLoading: contentsLoading, addContent, updateContent, deleteContent, uploadFile } = useContents();
  const { slots, isLoading: slotsLoading } = useScheduleSlots();
  const { scheduledContents } = useScheduledContents();

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [isFromTrash, setIsFromTrash] = useState(false);
  const [newContent, setNewContent] = useState({ fileName: "", caption: "", description: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [isAssigning, setIsAssigning] = useState(false);
  
  // Track assignments made within current batch to prevent race conditions
  const batchAssignmentsRef = useRef<Map<string, Set<string>>>(new Map());

  // Multi-select state - new platform-based selection
  const [selectedPlatforms, setSelectedPlatforms] = useState<SelectedPlatform[]>([]);

  // Filter states for assign dialog
  const [dialogProfileFilter, setDialogProfileFilter] = useState<string>("all");
  const [dialogPlatformFilter, setDialogPlatformFilter] = useState<string>("all");

  const pendingContents = contents.filter((c) => c.status === "pending");
  const assignedContents = contents.filter((c) => c.status === "assigned" || c.status === "scheduled");
  const removedContents = contents.filter((c) => c.status === "removed");

  const getProfileById = (id?: string | null) => profiles.find((p) => p.id === id);

  // Build a map of occupied slot-dates
  const occupiedSlotDates = useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    contents?.forEach(c => {
      if (c.scheduled_slot_id && c.scheduled_at) {
        const dateStr = format(new Date(c.scheduled_at), 'yyyy-MM-dd');
        if (!map.has(c.scheduled_slot_id)) {
          map.set(c.scheduled_slot_id, new Set());
        }
        map.get(c.scheduled_slot_id)!.add(dateStr);
      }
    });
    
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
  // Accepts optional batchAssignments to check against in-flight assignments
  const findNextAvailableSlot = useCallback((
    platformSlots: ScheduleSlot[],
    nowWib: Date,
    batchAssignments?: Map<string, Set<string>>
  ): NextAvailableSlot | null => {
    if (platformSlots.length === 0) return null;

    const sortedSlots = [...platformSlots].sort((a, b) => {
      if (a.hour !== b.hour) return a.hour - b.hour;
      return a.minute - b.minute;
    });

    for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
      const checkDate = addDays(startOfDay(nowWib), dayOffset);
      const dayOfWeek = checkDate.getDay();

      for (const slot of sortedSlots) {
        if (slot.type === 'weekly' && slot.week_days) {
          if (!slot.week_days.includes(dayOfWeek)) continue;
        }

        const slotDateTimeWib = new Date(checkDate);
        slotDateTimeWib.setHours(slot.hour, slot.minute, 0, 0);

        if (dayOffset === 0 && nowWib >= slotDateTimeWib) continue;

        const dateStr = format(checkDate, 'yyyy-MM-dd');
        
        // Check database cache
        const occupiedDates = occupiedSlotDates.get(slot.id);
        if (occupiedDates?.has(dateStr)) continue;
        
        // Check in-flight batch assignments to prevent race conditions
        const batchDates = batchAssignments?.get(slot.id);
        if (batchDates?.has(dateStr)) continue;

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
      
      (profile.connected_accounts as ConnectedAccount[]).forEach((acc) => {
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

    return options.sort((a, b) => {
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.profileName.localeCompare(b.profileName);
    });
  }, [profiles, slots, findNextAvailableSlot]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Cleanup previous preview URL
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }

      setSelectedFile(file);
      setNewContent((prev) => ({ ...prev, fileName: file.name }));

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
    setNewContent({ fileName: "", caption: "", description: "" });

    // Reset file input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!newContent.fileName.trim() || !selectedFile) return;

    setIsUploading(true);

    try {
      // Upload file to storage first
      const fileUrl = await uploadFile(selectedFile);
      if (!fileUrl) {
        toast.error("Failed to upload file to storage");
        return;
      }

      // Save metadata with valid file_url
      addContent.mutate({
        file_name: newContent.fileName,
        caption: newContent.caption || null,
        description: newContent.description || null,
        file_size: selectedFile.size,
        file_url: fileUrl,
        assigned_profile_id: null,
        scheduled_at: null,
        scheduled_slot_id: null,
        status: "pending",
        removed_at: null,
        removed_from_profile_id: null,
      });

      clearPreview();
      toast.success("Content uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload content");
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const openAssignDialog = (contentId: string, fromTrash: boolean = false) => {
    setSelectedContentId(contentId);
    setIsFromTrash(fromTrash);
    setSelectedPlatforms([]);
    setDialogProfileFilter("all");
    setDialogPlatformFilter("all");
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
    if (!selectedContentId || selectedPlatforms.length === 0) return;

    const originalContent = contents.find((c) => c.id === selectedContentId);
    if (!originalContent) return;

    setIsAssigning(true);
    const nowWib = getNowWib();
    let successCount = 0;
    
    // Clear batch assignments ref at start of new batch
    batchAssignmentsRef.current = new Map();

    try {
      for (let i = 0; i < selectedPlatforms.length; i++) {
        const selection = selectedPlatforms[i];
        
        const platformSlots = slots.filter(
          s => s.profile_id === selection.profileId && 
               s.platform === selection.platform && 
               s.is_active
        );
        
        // Pass batch assignments to prevent race conditions within this batch
        const nextSlot = findNextAvailableSlot(platformSlots, nowWib, batchAssignmentsRef.current);
        
        if (!nextSlot) {
          toast.error(`No slot available for ${formatUsername(selection.accountUsername)}`);
          continue;
        }

        // Mark this slot+date as occupied in batch tracking BEFORE the async call
        const dateStr = format(nextSlot.displayDate, 'yyyy-MM-dd');
        if (!batchAssignmentsRef.current.has(nextSlot.slotId)) {
          batchAssignmentsRef.current.set(nextSlot.slotId, new Set());
        }
        batchAssignmentsRef.current.get(nextSlot.slotId)!.add(dateStr);

        if (i === 0) {
          await updateContent.mutateAsync({
            id: selectedContentId,
            assigned_profile_id: nextSlot.profileId,
            scheduled_slot_id: nextSlot.slotId,
            scheduled_at: nextSlot.scheduledAt.toISOString(),
            platform: selection.platform,
            status: "assigned",
            removed_at: null,
            removed_from_profile_id: null,
          });
        } else {
          await addContent.mutateAsync({
            file_name: originalContent.file_name,
            caption: originalContent.caption,
            description: originalContent.description,
            file_size: originalContent.file_size,
            file_url: originalContent.file_url,
            assigned_profile_id: nextSlot.profileId,
            scheduled_slot_id: nextSlot.slotId,
            scheduled_at: nextSlot.scheduledAt.toISOString(),
            platform: selection.platform,
            status: "assigned",
            removed_at: null,
            removed_from_profile_id: null,
          });
        }
        successCount++;
      }

      if (successCount > 0) {
        toast.success(`Content assigned to ${successCount} slot${successCount > 1 ? "s" : ""}`);
      }
      
      setAssignDialogOpen(false);
      setSelectedContentId(null);
      setSelectedPlatforms([]);
      setIsFromTrash(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign');
    } finally {
      setIsAssigning(false);
      // Clear batch assignments after completion
      batchAssignmentsRef.current = new Map();
    }
  };

  const handleAssignedContentClick = (content: (typeof assignedContents)[0]) => {
    if (content.assigned_profile_id) {
      const contentSlot = slots.find((s) => s.id === content.scheduled_slot_id);
      const params = new URLSearchParams();

      params.set("profile", content.assigned_profile_id);

      // Platform: prioritas content.platform > slot.platform
      const platform = content.platform || contentSlot?.platform;
      if (platform) {
        params.set("platform", platform);
      }

      // Hour: dari slot atau dari scheduled_at
      if (contentSlot) {
        params.set("hour", String(contentSlot.hour));
      } else if (content.scheduled_at) {
        // Manual mode: extract hour dari scheduled_at
        const scheduledDate = new Date(content.scheduled_at);
        params.set("hour", String(scheduledDate.getHours()));
      }

      // Date: parse dengan benar menggunakan local timezone
      if (content.scheduled_at) {
        const scheduledDate = new Date(content.scheduled_at);
        const year = scheduledDate.getFullYear();
        const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
        const day = String(scheduledDate.getDate()).padStart(2, '0');
        params.set("date", `${year}-${month}-${day}`);
      }

      params.set("contentId", content.id);

      navigate(`/schedule?${params.toString()}`);
    }
  };

  const handleDeleteContent = (contentId: string) => {
    // Move to trash (set status to removed)
    const content = contents.find((c) => c.id === contentId);
    if (content) {
      updateContent.mutate({
        id: contentId,
        status: "removed",
        removed_at: new Date().toISOString(),
        removed_from_profile_id: content.assigned_profile_id,
      });
      toast.success("Content moved to trash");
    }
  };

  const handlePermanentDelete = (contentId: string) => {
    deleteContent.mutate(contentId);
    toast.success("Content permanently deleted");
  };

  const isLoading = profilesLoading || contentsLoading || slotsLoading;

  // Filter platform options based on dialog filters
  const filteredPlatformOptions = platformOptions.filter((option) => {
    const matchProfile = dialogProfileFilter === "all" || option.profileId === dialogProfileFilter;
    const matchPlatform = dialogPlatformFilter === "all" || option.platform === dialogPlatformFilter;
    return matchProfile && matchPlatform;
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Content</h1>
          <p className="text-muted-foreground text-sm">Upload and manage your video content</p>
        </div>

        {/* Upload Section - Main/Large */}
        <div className="glass rounded-xl p-8">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="video/*" className="hidden" />

          {selectedFile && videoPreviewUrl ? (
            <div className="space-y-6">
              {/* Video Preview - 16:9 aspect ratio container - clickable */}
              <div
                className="relative w-full max-w-2xl mx-auto cursor-pointer group"
                style={{ aspectRatio: "16/9" }}
                onClick={handleUploadClick}
              >
                <div className="absolute inset-0 bg-black rounded-xl overflow-hidden">
                  <video src={videoPreviewUrl} className="w-full h-full object-contain pointer-events-none" muted />
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
                  onChange={(e) => setNewContent((prev) => ({ ...prev, caption: e.target.value }))}
                  className="resize-none max-w-2xl mx-auto"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description (optional)</label>
                <Textarea
                  placeholder="Write your description here..."
                  rows={3}
                  value={newContent.description}
                  onChange={(e) => setNewContent((prev) => ({ ...prev, description: e.target.value }))}
                  className="resize-none max-w-2xl mx-auto"
                />
              </div>

              <div className="flex gap-3 justify-center">
                <Button onClick={handleUpload} variant="default" disabled={!newContent.caption.trim() || isUploading}>
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Add to Queue
                    </>
                  )}
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
              <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-xs">{pendingContents.length}</span>
            </TabsTrigger>
            <TabsTrigger value="assigned" className="gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              Assigned
              <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-xs">{assignedContents.length}</span>
            </TabsTrigger>
            <TabsTrigger value="trash" className="gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Trash
              <span className="ml-1 px-1.5 py-0.5 rounded bg-secondary text-xs">{removedContents.length}</span>
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
                  {pendingContents.map((content) => (
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
                              {format(new Date(content.uploaded_at), "MMM d, yyyy HH:mm")}
                            </p>
                            {content.caption && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">{content.caption}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openAssignDialog(content.id)}>
                            <Send className="w-4 h-4 mr-1" />
                            Assign
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => handleDeleteContent(content.id)}>
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
                  {assignedContents.map((content) => {
                    const profile = getProfileById(content.assigned_profile_id);
                    const contentSlot = slots.find((s) => s.id === content.scheduled_slot_id);
                    const slotTime = contentSlot
                      ? `${String(contentSlot.hour).padStart(2, "0")}:${String(contentSlot.minute).padStart(2, "0")}`
                      : null;

                    // Get platform: prioritize content.platform (for manual mode), then slot, then profile
                    const contentPlatform = content.platform || contentSlot?.platform || profile?.platform;

                    // Get connected account for profile picture - use content platform
                    const connectedAccount = profile?.connected_accounts?.find(
                      (acc: ConnectedAccount) => acc.platform === contentPlatform,
                    ) as ConnectedAccount | undefined;

                    // Format scheduled date if available
                    const scheduledDate = content.scheduled_at ? format(new Date(content.scheduled_at), "MMM d") : null;

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
                                {contentPlatform ? (
                                  <PlatformIcon platform={contentPlatform as Platform} className="w-5 h-5" />
                                ) : (
                                  <FileVideo className="w-5 h-5 text-primary" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate" title={content.file_name}>
                                {content.file_name}
                              </p>
                              {(profile || contentPlatform) && (
                                <div className="flex items-center gap-2 mt-1">
                                  <PlatformIcon
                                    platform={contentPlatform as Platform}
                                    className="w-4 h-4 text-muted-foreground"
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    {formatUsername(connectedAccount?.username || profile?.name || '')}
                                  </span>
                                  {slotTime && <span className="text-sm text-muted-foreground">• {slotTime}</span>}
                                  {scheduledDate && (
                                    <span className="text-sm text-muted-foreground">• {scheduledDate}</span>
                                  )}
                                </div>
                              )}
                              {/* Caption - same as Pending tab */}
                              {content.caption && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">{content.caption}</p>
                              )}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium flex-shrink-0",
                              content.status === "scheduled"
                                ? "bg-primary/10 text-primary"
                                : "bg-warning/10 text-warning",
                            )}
                          >
                            {content.status === "scheduled" ? "Scheduled" : "Assigned"}
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
                  {removedContents.map((content) => {
                    const profile = content.removed_from_profile_id
                      ? getProfileById(content.removed_from_profile_id)
                      : null;
                    const connectedAccount = profile?.connected_accounts?.find(
                      (acc: ConnectedAccount) => acc.platform === profile.platform,
                    ) as ConnectedAccount | undefined;

                    return (
                      <div
                        key={content.id}
                        className="p-4 rounded-lg bg-white hover:bg-orange-50 transition-colors group border border-orange-100"
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
                                {profile ? (
                                  <PlatformIcon platform={profile.platform as Platform} className="w-5 h-5" />
                                ) : (
                                  <FileVideo className="w-5 h-5 text-orange-600" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate" title={content.file_name}>
                                {content.file_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {profile && (
                                  <>
                                    <PlatformIcon
                                      platform={profile.platform as Platform}
                                      className="w-4 h-4 text-muted-foreground"
                                    />
                                    <span className="text-sm text-muted-foreground">
                                      {formatUsername(connectedAccount?.username || profile.name)}
                                    </span>
                                  </>
                                )}
                                {content.removed_at && (
                                  <span className="text-sm text-muted-foreground">
                                    • {format(new Date(content.removed_at), "MMM d, HH:mm")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openAssignDialog(content.id, true)}>
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

        {/* Assign Dialog - Auto-Assign by Platform */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Auto Assign to Platform</DialogTitle>
            </DialogHeader>

            {/* Filters */}
            <div className="flex items-center gap-2 pt-2">
              <Select value={dialogProfileFilter} onValueChange={setDialogProfileFilter}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="All Profiles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Profiles</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={dialogPlatformFilter} onValueChange={setDialogPlatformFilter}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="All Platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="instagram">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform="instagram" className="w-4 h-4" />
                      <span>Instagram</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="youtube">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform="youtube" className="w-4 h-4" />
                      <span>YouTube</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="tiktok">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform="tiktok" className="w-4 h-4" />
                      <span>TikTok</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto py-2">
              {filteredPlatformOptions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50 text-muted-foreground" />
                  <p className="text-muted-foreground">No active schedule slots available</p>
                  <p className="text-sm text-muted-foreground mt-1">Create schedule slots first</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate("/profiles")}>
                    Go to Profiles
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPlatformOptions.map(option => {
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
