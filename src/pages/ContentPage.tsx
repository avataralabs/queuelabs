import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlatformBadge } from '@/components/common/PlatformBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Upload, FileVideo, Trash2, Send, Calendar, CloudUpload, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ContentPage() {
  const navigate = useNavigate();
  const { 
    contents, 
    profiles, 
    scheduleSlots,
    addContent, 
    deleteContent, 
    assignContentToProfile,
    getRemovedContents,
    restoreRemovedContent,
    permanentDeleteContent,
  } = useAppStore();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [isFromTrash, setIsFromTrash] = useState(false);
  const [newContent, setNewContent] = useState({ fileName: '', caption: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('pending');
  
  const pendingContents = contents.filter(c => c.status === 'pending');
  const assignedContents = contents.filter(c => c.status === 'assigned' || c.status === 'scheduled');
  const removedContents = getRemovedContents();
  
  const getProfileById = (id?: string) => profiles.find(p => p.id === id);
  
  const getProfileHasSlots = (profileId: string) => {
    return scheduleSlots.some(s => s.profileId === profileId && s.isActive);
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setNewContent(prev => ({ ...prev, fileName: file.name }));
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = () => {
    if (!newContent.fileName.trim()) return;
    
    addContent({
      fileName: newContent.fileName,
      caption: newContent.caption,
      fileSize: selectedFile?.size || Math.random() * 100 * 1024 * 1024,
    });
    
    setNewContent({ fileName: '', caption: '' });
    setSelectedFile(null);
    toast.success('Content added to queue');
  };
  
  const openAssignDialog = (contentId: string, fromTrash: boolean = false) => {
    setSelectedContentId(contentId);
    setIsFromTrash(fromTrash);
    setAssignDialogOpen(true);
  };
  
  const handleAssign = (profileId: string) => {
    if (!selectedContentId) return;
    
    const hasSlots = getProfileHasSlots(profileId);
    if (!hasSlots) {
      toast.error('This profile has no time slots. Please create time slots first.');
      return;
    }
    
    // If from trash, restore first then assign
    if (isFromTrash) {
      restoreRemovedContent(selectedContentId);
    }
    
    assignContentToProfile(selectedContentId, profileId);
    setAssignDialogOpen(false);
    setSelectedContentId(null);
    setIsFromTrash(false);
    toast.success('Content assigned to profile');
  };
  
  const handleAssignedContentClick = (content: typeof assignedContents[0]) => {
    if (content.assignedProfileId) {
      navigate(`/schedule?profile=${content.assignedProfileId}`);
    }
  };
  
  const handlePermanentDelete = (contentId: string) => {
    permanentDeleteContent(contentId);
    toast.success('Content permanently deleted');
  };
  
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
          
          <div 
            onClick={handleUploadClick}
            className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer mb-6"
          >
            <CloudUpload className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">
              {selectedFile ? selectedFile.name : 'Click to upload video'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {selectedFile 
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
                : 'or drag & drop your video file here'
              }
            </p>
          </div>
          
          {selectedFile && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Caption</label>
                <Textarea
                  placeholder="Write your caption here..."
                  rows={3}
                  value={newContent.caption}
                  onChange={(e) => setNewContent(prev => ({ ...prev, caption: e.target.value }))}
                  className="resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleUpload} className="flex-1" variant="default">
                  <Upload className="w-4 h-4" />
                  Add to Queue
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSelectedFile(null);
                    setNewContent({ fileName: '', caption: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
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
              {pendingContents.length === 0 ? (
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
                          <FileVideo className="w-5 h-5 text-primary flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate" title={content.fileName}>
                              {content.fileName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(content.uploadedAt), 'MMM d, yyyy HH:mm')}
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
                            onClick={() => deleteContent(content.id)}
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
              {assignedContents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No assigned content</p>
                  <p className="text-sm">Assign pending content to profiles</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignedContents.map(content => {
                    const profile = getProfileById(content.assignedProfileId);
                    return (
                      <div 
                        key={content.id}
                        onClick={() => handleAssignedContentClick(content)}
                        className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileVideo className="w-5 h-5 text-primary flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate" title={content.fileName}>
                                {content.fileName}
                              </p>
                              {profile && (
                                <div className="flex items-center gap-2 mt-1">
                                  <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                                  <span className="text-sm text-muted-foreground">{profile.name}</span>
                                  {content.scheduledAt && (
                                    <span className="text-sm text-primary">
                                      • {format(new Date(content.scheduledAt), 'MMM d, HH:mm')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium",
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
              {removedContents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">Trash is empty</p>
                  <p className="text-sm">Removed content will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {removedContents.map(content => {
                    const profile = content.removedFromProfileId 
                      ? getProfileById(content.removedFromProfileId) 
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
                              <p className="font-medium truncate" title={content.fileName}>
                                {content.fileName}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {profile && (
                                  <>
                                    <span>Removed from:</span>
                                    <PlatformBadge platform={profile.platform} size="sm" showLabel={false} />
                                    <span>{profile.name}</span>
                                  </>
                                )}
                                {content.removedAt && (
                                  <span className="ml-2">
                                    • {format(new Date(content.removedAt), 'MMM d, HH:mm')}
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
        
        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Assign to Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {profiles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No profiles created yet. Create a profile first.
                </p>
              ) : (
                <div className="space-y-2">
                  {profiles.map(profile => {
                    const hasSlots = getProfileHasSlots(profile.id);
                    return (
                      <button
                        key={profile.id}
                        onClick={() => handleAssign(profile.id)}
                        disabled={!hasSlots}
                        className={cn(
                          "w-full p-4 rounded-lg transition-colors flex items-center justify-between",
                          hasSlots 
                            ? "bg-secondary/50 hover:bg-secondary" 
                            : "bg-muted/30 opacity-60 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{profile.name}</span>
                          <PlatformBadge platform={profile.platform} size="sm" />
                        </div>
                        {!hasSlots && (
                          <div className="flex items-center gap-1 text-destructive text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>No time slots</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Profiles without time slots cannot receive content
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}