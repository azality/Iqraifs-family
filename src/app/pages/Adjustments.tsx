import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Lock } from "lucide-react";

export function Adjustments() {
  const { isParentMode } = useAuth();
  const { getCurrentChild, addAdjustment, loading } = useFamilyContext();
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"positive" | "negative">("positive");
  
  const child = getCurrentChild();

  if (!isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <Lock className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                Only parents can make manual adjustments. Switch to parent mode to access this feature.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state while data is being fetched
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to create an adjustment.</p>
      </div>
    );
  }

  const handleSubmit = () => {
    const pointValue = parseInt(points);
    
    if (!points || isNaN(pointValue) || pointValue === 0) {
      toast.error("Please enter a valid point value");
      return;
    }

    if (!reason.trim()) {
      toast.error("Please provide a reason for this adjustment");
      return;
    }

    const finalPoints = type === "negative" ? -Math.abs(pointValue) : Math.abs(pointValue);
    
    addAdjustment(child.id, finalPoints, reason);
    
    toast.success(`Adjustment created: ${finalPoints > 0 ? '+' : ''}${finalPoints} points for ${child.name}`);
    
    setPoints("");
    setReason("");
    setType("positive");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Manual Adjustment</CardTitle>
          <CardDescription>
            Add or subtract points with full transparency and audit trail for {child.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as "positive" | "negative")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="positive" id="positive" />
                  <Label htmlFor="positive" className="cursor-pointer">
                    Positive (+) - Bonus, correction, or special reward
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="negative" id="negative" />
                  <Label htmlFor="negative" className="cursor-pointer">
                    Negative (−) - Correction or reset
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="points">Point Value</Label>
              <Input
                id="points"
                type="number"
                placeholder="Enter point value (e.g., 10)"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                min="1"
              />
              <p className="text-xs text-muted-foreground">
                Enter the absolute value. Sign will be applied based on type selected above.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Required)</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this adjustment is being made..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                This will be visible in the audit trail and child's history
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} className="flex-1">
              Create Adjustment
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setPoints("");
                setReason("");
                setType("positive");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>When to Use Adjustments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="font-medium text-green-900 mb-1">✓ Positive Adjustments:</p>
            <ul className="list-disc list-inside space-y-1 text-green-800 ml-2">
              <li>Special bonus for exceptional behavior</li>
              <li>Correcting a mistaken negative entry</li>
              <li>Recovery bonus after reflection</li>
              <li>Season/milestone completion reward</li>
            </ul>
          </div>

          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="font-medium text-red-900 mb-1">− Negative Adjustments:</p>
            <ul className="list-disc list-inside space-y-1 text-red-800 ml-2">
              <li>Correcting a mistaken positive entry</li>
              <li>System calibration</li>
              <li>Season reset (with reason)</li>
            </ul>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="font-medium text-blue-900 mb-1">🔒 Governance Rules:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800 ml-2">
              <li>All adjustments require a written reason</li>
              <li>Adjustments are clearly marked in the child's history</li>
              <li>Full audit trail maintained for transparency</li>
              <li>Cannot be used to silently manipulate points</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}