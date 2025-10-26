import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeaMachineStore } from "@/store/useTeaMachineStore";
import type { TeaMachineState } from "@/lib/bluetooth";
import { BluetoothManager } from "@/lib/bluetooth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Bluetooth, BluetoothOff, Power, Thermometer, Flame, Coffee, Droplets, LogOut, Settings, Leaf } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { WaterLevelCard } from "@/components/WaterLevelCard";
import { LeafUsageCard } from "@/components/LeafUsageCard";

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isConnected, state, connect, disconnect, sendCommand, lastCupServedShown, markCupServedShown } =
    useTeaMachineStore();

  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastEventShown, setLastEventShown] = useState<string | null>(null);
  const [leafCumulativeTime, setLeafCumulativeTime] = useState(0);
  const [lastBrewMs, setLastBrewMs] = useState(0);
  const [persistedWaterMl, setPersistedWaterMl] = useState(1700);
  const [waterWarningShown, setWaterWarningShown] = useState(false);
  const [brewCount, setBrewCount] = useState(0);
  const [lastBrewTime, setLastBrewTime] = useState(0);
  const [showRefilledBrewReminder, setShowRefilledBrewReminder] = useState(false);
  const [wasBrewActive, setWasBrewActive] = useState(false);

  useEffect(() => {
    checkAuth();
    loadTeaMachineState();
  }, []);

  useEffect(() => {
    // Show cup served toast
    if (state?.event === "CUP_SERVED" && !lastCupServedShown) {
      toast({
        title: "Enjoy your tea! ☕",
        description: "Your tea is ready from the Tea Machine",
      });
      markCupServedShown();
    }

    // Show leaf replace required toast
    if (state?.event === "LEAF_REPLACE_REQUIRED" && lastEventShown !== "LEAF_REPLACE_REQUIRED") {
      toast({
        title: "Leaf Limit Reached",
        description: "Replace leaves to continue brewing",
        variant: "destructive",
      });
      setLastEventShown("LEAF_REPLACE_REQUIRED");
    }

    // Show leaves reset toast
    if (state?.event === "LEAVES_RESET" && lastEventShown !== "LEAVES_RESET") {
      toast({
        title: "Leaves Replaced",
        description: "Leaves replaced. Counters reset.",
      });
      setLastEventShown("LEAVES_RESET");
    }

    // Clear last event when event is NONE
    if (state?.event === "NONE") {
      setLastEventShown(null);
    }
  }, [state?.event, lastCupServedShown, lastEventShown]);

  // Check if water drops to or below 1000ml
  useEffect(() => {
    if (persistedWaterMl <= 1000 && !waterWarningShown) {
      toast({
        title: "Water Low",
        description: "Water level at or below 1000ml. Please refill.",
        variant: "destructive",
      });
      setWaterWarningShown(true);
    } else if (persistedWaterMl > 1000) {
      setWaterWarningShown(false);
    }
  }, [persistedWaterMl, waterWarningShown]);

  const isSystemOn = state?.sys === "ON";
  const isBrewActive = state?.brew && !["IDLE", "DONE"].includes(state.brew);
  
  // Brewing parameters based on tea type
  const brewParams = state?.tea === "BLACK" 
    ? { t0: 300000, k: 0.7, tMax: 720000 } // 5 min, k=0.7, 12 min max
    : { t0: 180000, k: 0.8, tMax: 540000 }; // 3 min, k=0.8, 9 min max
  
  const isLeafLimitReached = leafCumulativeTime >= brewParams.tMax;


  // Calculate next brew time based on successive infusion formula: tn = k * tn-1
  const calculateNextBrewTime = () => {
    if (brewCount === 0) {
      return brewParams.t0; // First brew uses t0
    }
    return Math.round(lastBrewTime * brewParams.k); // Subsequent brews use tn = k * tn-1
  };

  // Track leaf usage during brewing
  useEffect(() => {
    if (!state || !isBrewActive) {
      setLastBrewMs(state?.brew_ms || 0);
      return;
    }

    // Calculate time difference and add to cumulative
    if (state.brew_ms > lastBrewMs) {
      const timeDiff = state.brew_ms - lastBrewMs;
      setLeafCumulativeTime(prev => {
        const newTime = prev + timeDiff;
        saveTeaMachineState(newTime);
        return newTime;
      });
    }
    setLastBrewMs(state.brew_ms);

    // Check if limit reached
    if (leafCumulativeTime >= brewParams.tMax && lastEventShown !== "LEAF_LIMIT") {
      toast({
        title: "Leaf Limit Reached",
        description: `Maximum steep time of ${formatTime(brewParams.tMax)} reached. Replace leaves for next brew.`,
        variant: "destructive",
      });
      setLastEventShown("LEAF_LIMIT");
    }
  }, [state?.brew_ms, state?.tea, isBrewActive]);

  // Detect brew start regardless of source (UI or device) and set recommended time
  useEffect(() => {
    setWasBrewActive((prev) => {
      if (isBrewActive && !prev) {
        setShowRefilledBrewReminder(false);
        setBrewCount((prevCount) => {
          const newCount = prevCount + 1;
          const nextTime =
            newCount === 1
              ? brewParams.t0
              : Math.round(brewParams.t0 * Math.pow(brewParams.k, newCount - 1));
          setLastBrewTime(nextTime);
          return newCount;
        });
      }
      return !!isBrewActive;
    });
  }, [isBrewActive, brewParams.t0, brewParams.k]);
  const loadTeaMachineState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from("tea_machine_state")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (data) {
      setLeafCumulativeTime(data.leaf_cumulative_ms);
      setPersistedWaterMl(data.water_ml);
    }
  };

  const saveTeaMachineState = async (cumulativeMs: number, waterMl?: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: existing } = await supabase
      .from("tea_machine_state")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const updateData = {
      leaf_cumulative_ms: cumulativeMs,
      ...(waterMl !== undefined && { water_ml: waterMl })
    };

    if (existing) {
      await supabase
        .from("tea_machine_state")
        .update(updateData)
        .eq("user_id", session.user.id);
    } else {
      await supabase
        .from("tea_machine_state")
        .insert({ 
          user_id: session.user.id, 
          leaf_cumulative_ms: cumulativeMs, 
          water_ml: waterMl ?? persistedWaterMl 
        });
    }
  };


  const checkAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("approved, email")
      .eq("id", session.user.id)
      .single();

    if (!profile?.approved) {
      navigate("/pending");
      return;
    }

    setUserEmail(profile.email || session.user.email || "");

    // Check if user is admin (you can set this via environment variable or hardcode)
    // For now, we'll add a simple check - in production, use environment variables
    const adminEmails = ["aaron.isserow@gmail.com"]; // Replace with actual admin emails
    setIsAdmin(adminEmails.includes(profile.email || ""));
  };

  const handleConnect = async () => {
    if (!BluetoothManager.isBluetoothAvailable()) {
      toast({
        variant: "destructive",
        title: "Bluetooth Not Available",
        description: "Please use Chrome/Edge on desktop or Android. iOS Safari doesn't support Web Bluetooth.",
      });
      return;
    }

    try {
      await connect();
      toast({
        title: "Connected",
        description: "Successfully connected to Tea Machine",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Failed to connect to Tea Machine. Please try again.",
      });
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast({
      title: "Disconnected",
      description: "Disconnected from Tea Machine",
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleReplaceLeaves = () => {
    setLeafCumulativeTime(0);
    setBrewCount(0);
    setLastBrewTime(0);
    setLastEventShown(null);
    saveTeaMachineState(0);
    sendCommand("LEAVES:REPLACED");
  };

  // Water consumption helpers
  const consumeWater = (amount: number) => {
    setPersistedWaterMl((prev) => {
      const newWaterMl = Math.max(0, prev - amount);
      saveTeaMachineState(leafCumulativeTime, newWaterMl);
      return newWaterMl;
    });
  };

  const handleDispenseTaste = () => {
    if (!isSystemOn || persistedWaterMl <= 1000) return;
    sendCommand("DISPENSE:TASTE");
    consumeWater(115);
  };

  const handleRecycleWater = () => {
    if (!isSystemOn || persistedWaterMl <= 1000) return;
    sendCommand("DISPENSE:TASTE");
    consumeWater(115);
  };

  const handleDispenseCup = () => {
    if (!isSystemOn || persistedWaterMl <= 1000) return;
    sendCommand("DISPENSE:CUP");
    consumeWater(287.5);
  };

  const handleMarkRefilled = () => {
    setPersistedWaterMl(1700);
    setWaterWarningShown(false);
    setShowRefilledBrewReminder(true);
    saveTeaMachineState(leafCumulativeTime, 1700);
    toast({
      title: "Water Refilled",
      description: "Water level reset to 1.7L",
    });
  };

  const getBrewProgress = () => {
    if (!state) return 0;
    const target = lastBrewTime || brewParams.t0;
    return Math.min(100, (state.brew_ms / target) * 100);
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };


  const getTargetTempRange = () => {
    if (!state) return "";
    return state.tea === "GREEN" ? "82-84°C" : "96-98°C";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Coffee className="h-6 w-6 text-primary" />
                  Tea Machine Control
                </CardTitle>
                <CardDescription>{userEmail}</CardDescription>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <Button variant="outline" onClick={() => navigate("/admin")}>
                    <Settings className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                )}
                <Button variant="outline" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Bluetooth Connection</span>
              {isConnected ? (
                <Badge className="bg-success">
                  <Bluetooth className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <BluetoothOff className="h-3 w-3 mr-1" />
                  Disconnected
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isConnected ? (
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect from TeaMachine
              </Button>
            ) : (
              <Button onClick={handleConnect}>
                <Bluetooth className="h-4 w-4 mr-2" />
                Connect to TeaMachine
              </Button>
            )}
          </CardContent>
        </Card>

        {isConnected && state && (
          <>
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* System Status */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Power className={`h-4 w-4 ${isSystemOn ? "text-success" : "text-muted-foreground"}`} />
                    System
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{state.sys}</span>
                    <Switch
                      checked={isSystemOn}
                      onCheckedChange={(checked) => sendCommand(checked ? "SYS:ON" : "SYS:OFF")}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => sendCommand("SET:TEA=BLACK")}
                      variant={state?.tea === "BLACK" ? "default" : "outline"}
                      size="sm"
                      disabled={!isSystemOn}
                    >
                      <Coffee className="h-4 w-4 mr-2" />
                      Black
                    </Button>
                    <Button
                      onClick={() => sendCommand("SET:TEA=GREEN")}
                      variant={state?.tea === "GREEN" ? "default" : "outline"}
                      size="sm"
                      disabled={!isSystemOn}
                    >
                      <Leaf className="h-4 w-4 mr-2" />
                      Green
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Temperature */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-destructive" />
                    Temperature
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-bold">{state.T.toFixed(1)}°C</div>
                  <div className="text-sm text-muted-foreground mt-1">Target: {getTargetTempRange()}</div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-medium">Heating</span>
                    <Switch
                      checked={state.heating === 1}
                      onCheckedChange={(checked) => sendCommand(checked ? "HEAT:START" : "HEAT:STOP")}
                      disabled={!isSystemOn}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dispense */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-info" />
                    Dispense
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={handleDispenseTaste}
                      disabled={!isSystemOn || persistedWaterMl <= 1000}
                      variant="secondary"
                      className="flex-1"
                      size="sm"
                    >
                      <Droplets className="h-4 w-4 mr-1" />
                      Taste
                    </Button>
                    <Button
                      onClick={handleDispenseCup}
                      disabled={!isSystemOn || persistedWaterMl <= 1000}
                      variant="secondary"
                      className="flex-1"
                      size="sm"
                    >
                      <Droplets className="h-4 w-4 mr-1" />
                      Cup
                    </Button>
                  </div>
                  <Button
                    onClick={handleRecycleWater}
                    disabled={!isSystemOn || persistedWaterMl <= 1000}
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    Recycle Water
                  </Button>
                </CardContent>
              </Card>

            </div>

            {/* Brew Status, Water Level, and Leaf Usage - All Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Brew Status */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-primary" />
                    Brew Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Refill Reminder Alert */}
                  {showRefilledBrewReminder && (
                    <Alert className="border-primary bg-primary/10">
                      <Coffee className="h-4 w-4 text-primary" />
                      <AlertDescription className="ml-6">
                        Please brew again to restore tea concentration
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Leaf Strength Indicator */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Leaf Strength</span>
                      <span className="text-xs font-medium">
                        {Math.max(0, Math.round(((brewParams.tMax - leafCumulativeTime) / brewParams.tMax) * 100))}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.max(0, ((brewParams.tMax - leafCumulativeTime) / brewParams.tMax) * 100)} 
                      className="h-2"
                    />
                  </div>

                  {isBrewActive && (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <Badge variant="default">
                          {formatTime(state.brew_ms)} / {formatTime(lastBrewTime || brewParams.t0)}
                        </Badge>
                      </div>
                      <Progress value={getBrewProgress()} className="h-2" />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Brewing</span>
                    <Switch
                      checked={isBrewActive}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          if (isLeafLimitReached) {
                            toast({
                              title: "Cannot Brew",
                              description: "Replace leaves first.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Clear refill reminder when brewing starts
                          setShowRefilledBrewReminder(false);
                          
                          // Clear refill reminder when brewing starts
                          setShowRefilledBrewReminder(false);
                          
                          // Predict next brew time (state will update when brew actually starts)
                          const predictedCount = brewCount + 1;
                          const predictedTime = predictedCount === 1
                            ? brewParams.t0
                            : Math.round(brewParams.t0 * Math.pow(brewParams.k, predictedCount - 1));
                          
                          // Send standard brew command - backend handles actual timing
                          sendCommand("BREW:START");
                          
                          toast({
                            title: `Brew ${predictedCount} Started`,
                            description: `Recommended time: ${formatTime(predictedTime)}`,
                          });
                        } else {
                          sendCommand("BREW:STOP");
                        }
                      }}
                      disabled={!isSystemOn || isLeafLimitReached}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Water Level */}
              <WaterLevelCard
                water_ml={persistedWaterMl}
                tank_pct={persistedWaterMl / 1700}
                onMarkRefilled={handleMarkRefilled}
                isConnected={isConnected}
              />

              {/* Leaf Usage */}
              <LeafUsageCard
                teaType={state.tea}
                cumulativeTime={leafCumulativeTime}
                maxTime={brewParams.tMax}
                onReplaceLeaves={handleReplaceLeaves}
                isConnected={isConnected}
                brewCount={brewCount}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
