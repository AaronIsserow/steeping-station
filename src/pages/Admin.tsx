import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ShieldCheck } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  approved: boolean;
  created_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminAccess();
    loadProfiles();
  }, []);

  const checkAdminAccess = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, approved")
      .eq("id", session.user.id)
      .single();

    if (!profile?.approved) {
      navigate("/pending");
      return;
    }

    // Check if user is admin (hardcoded for demo - use env variable in production)
    const adminEmails = ["aaron.isserow@gmail.com"]; // Replace with actual admin emails
    if (!adminEmails.includes(profile.email || "")) {
      navigate("/dashboard");
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You don't have admin privileges",
      });
    }
  };

  const loadProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load user profiles",
      });
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  };

  const toggleApproval = async (userId: string, currentApproval: boolean) => {
    const { error } = await supabase.from("profiles").update({ approved: !currentApproval }).eq("id", userId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update approval status",
      });
    } else {
      toast({
        title: "Success",
        description: `User ${!currentApproval ? "approved" : "revoked"}`,
      });
      loadProfiles();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <div>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    Admin Panel
                  </CardTitle>
                  <CardDescription>Manage user approvals</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>User Approvals</CardTitle>
            <CardDescription>Toggle user approval status to grant or revoke access to the Tea Machine</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading users...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.email}</TableCell>
                      <TableCell>{new Date(profile.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {profile.approved ? (
                          <span className="text-success font-medium">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={profile.approved}
                          onCheckedChange={() => toggleApproval(profile.id, profile.approved)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {profiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
