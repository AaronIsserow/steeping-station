import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Coffee } from "lucide-react";

export default function Pending() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    checkApprovalStatus();

    // Check approval status every 5 seconds
    const interval = setInterval(checkApprovalStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const checkApprovalStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    setUserEmail(session.user.email || "");

    const { data: profile } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", session.user.id)
      .single();

    if (profile?.approved) {
      navigate("/dashboard");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-warning/10 rounded-full">
              <Clock className="h-12 w-12 text-warning animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
          <CardDescription>
            Your account ({userEmail}) has been created successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg text-center">
            <Coffee className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Please wait while an administrator reviews and approves your account.
              You'll be able to access the Tea Machine dashboard once approved.
            </p>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            This page will automatically refresh when your account is approved.
          </p>
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
