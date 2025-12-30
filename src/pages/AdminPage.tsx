import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useProfiles } from '@/hooks/useProfiles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Settings, Trash2, Shield, ShieldCheck, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { PlatformBadge } from '@/components/common/PlatformBadge';

export default function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, isAdminLoading, allRoles, allRolesLoading, updateRole, deleteUserRole, approveUser } = useUserRoles();
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const [activeTab, setActiveTab] = useState('users');

  if (isAdminLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="w-16 h-16 mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have permission to access the Admin Panel.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">
            Manage users and system settings
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50 p-1 rounded-lg">
            <TabsTrigger 
              value="users" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all"
            >
              <Users className="w-4 h-4" />
              User Management
            </TabsTrigger>
            <TabsTrigger 
              value="profiles"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all"
            >
              <Settings className="w-4 h-4" />
              Profile Management
            </TabsTrigger>
          </TabsList>

          {/* User Management Tab */}
          <TabsContent value="users" className="mt-6">
            <div className="glass rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Role</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Last Login</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allRolesLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                      </TableCell>
                    </TableRow>
                  ) : allRoles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    allRoles.map((userRole) => {
                      const isCurrentUser = userRole.user_id === user?.id;
                      return (
                        <TableRow key={userRole.id} className="border-border">
                          <TableCell className="font-medium">
                            {userRole.email || userRole.user_id.slice(0, 8) + '...'}
                          </TableCell>
                          <TableCell>
                            {isCurrentUser ? (
                              <Badge className="bg-primary/20 text-primary border-0 gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                admin
                              </Badge>
                            ) : (
                              <Select
                                value={userRole.role}
                                onValueChange={(value: 'admin' | 'user') => 
                                  updateRole.mutate({ userId: userRole.user_id, role: value })
                                }
                              >
                                <SelectTrigger className="w-28 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="user">User</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            {userRole.is_approved ? (
                              <Badge variant="outline" className="border-green-500/50 text-green-500 bg-green-500/10">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 bg-yellow-500/10">
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {userRole.last_sign_in_at 
                              ? format(new Date(userRole.last_sign_in_at), 'MMM d, yyyy HH:mm')
                              : 'Never'
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!isCurrentUser && !userRole.is_approved && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                  onClick={() => approveUser.mutate(userRole.user_id)}
                                  title="Approve user"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                              )}
                              {!isCurrentUser && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    if (confirm('Are you sure you want to remove this user\'s role?')) {
                                      deleteUserRole.mutate(userRole.user_id);
                                    }
                                  }}
                                  title="Delete user role"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Profile Management Tab */}
          <TabsContent value="profiles" className="mt-6">
            <div className="glass rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Profile Name</TableHead>
                    <TableHead className="text-muted-foreground">Platform</TableHead>
                    <TableHead className="text-muted-foreground">Created</TableHead>
                    <TableHead className="text-muted-foreground">Owner ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profilesLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                      </TableCell>
                    </TableRow>
                  ) : profiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No profiles found
                      </TableCell>
                    </TableRow>
                  ) : (
                    profiles.map((profile) => (
                      <TableRow key={profile.id} className="border-border">
                        <TableCell className="font-medium">{profile.name}</TableCell>
                        <TableCell>
                          <PlatformBadge platform={profile.platform} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(profile.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {profile.user_id.slice(0, 8)}...
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
