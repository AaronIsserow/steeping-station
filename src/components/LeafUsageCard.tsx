import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Leaf, AlertTriangle } from "lucide-react";

interface LeafUsageCardProps {
  teaType: string;
  cumulativeTime: number;
  maxTime: number;
  onReplaceLeaves: () => void;
  isConnected: boolean;
  brewCount: number;
}

export function LeafUsageCard({ 
  teaType, 
  cumulativeTime, 
  maxTime, 
  onReplaceLeaves, 
  isConnected,
  brewCount 
}: LeafUsageCardProps) {
  const isLimitReached = cumulativeTime >= maxTime;
  const percentUsed = (cumulativeTime / maxTime) * 100;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Get brewing parameters
  const params = teaType === "BLACK" 
    ? { t0: "5:00", k: 0.7, tMax: "12:00" }
    : { t0: "3:00", k: 0.8, tMax: "9:00" };

  return (
    <Card className={isLimitReached ? "border-destructive" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Leaf className="h-4 w-4 text-success" />
          Leaf Usage ({teaType})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">{formatTime(cumulativeTime)}</span>
            <span className="text-sm text-muted-foreground">of {formatTime(maxTime)}</span>
          </div>
          <Progress value={percentUsed} className="h-2" />
        </div>
        
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Brews completed:</span>
            <span className="font-medium">{brewCount}</span>
          </div>
          <div className="flex justify-between">
            <span>First brew time (t₀):</span>
            <span className="font-medium">{params.t0}</span>
          </div>
          <div className="flex justify-between">
            <span>Reduction factor (k):</span>
            <span className="font-medium">{params.k}</span>
          </div>
        </div>
        
        {isLimitReached && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-destructive font-medium">
                Max steep time reached. Replace leaves.
              </p>
              <Button
                onClick={onReplaceLeaves}
                disabled={!isConnected}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Replace Leaves
              </Button>
            </div>
          </div>
        )}
        
        {!isLimitReached && (
          <Button
            onClick={onReplaceLeaves}
            disabled={!isConnected}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Leaf className="h-4 w-4 mr-2" />
            Replace Leaves
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
