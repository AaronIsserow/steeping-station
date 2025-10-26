import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Droplets, AlertTriangle } from "lucide-react";

interface WaterLevelCardProps {
  water_ml: number;
  tank_pct: number;
  onMarkRefilled: () => void;
  isConnected: boolean;
}

export function WaterLevelCard({ water_ml, tank_pct, onMarkRefilled, isConnected }: WaterLevelCardProps) {
  const isLowWater = water_ml <= 1000;
  const percentDisplay = (tank_pct * 100).toFixed(0);

  return (
    <Card className={isLowWater ? "border-destructive" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Droplets className="h-4 w-4 text-info" />
          Water Level
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">{Math.round(water_ml)} ml</span>
            <span className="text-sm text-muted-foreground">Tank: {percentDisplay}%</span>
          </div>
          <Progress value={tank_pct * 100} className="h-2" />
        </div>
        
        {isLowWater && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-destructive font-medium">Low water. Refill soon.</p>
              <Button
                onClick={onMarkRefilled}
                disabled={!isConnected}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Mark Refilled
              </Button>
            </div>
          </div>
        )}
        
        {!isLowWater && (
          <Button
            onClick={onMarkRefilled}
            disabled={!isConnected}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Droplets className="h-4 w-4 mr-2" />
            Mark Refilled
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
