import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { format } from "date-fns";
import { Filter, Lock } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

export function AuditTrail() {
  const { isParentMode } = useAuth();
  const { getCurrentChild, pointEvents, children, familyId } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const [filter, setFilter] = useState<'all' | 'adjustments' | 'recovery'>('all');
  
  const child = getCurrentChild();

  // ✅ SIMPLIFIED: No need to fetch names - server now sends logged_by_display
  const getUserName = (event: any): string => {
    // Use server-provided logged_by_display if available
    if (event.logged_by_display) {
      return event.logged_by_display;
    }
    
    // Fallback logic for events without logged_by_display
    if (!event.loggedBy || event.loggedBy === 'system') {
      return 'System';
    }
    
    // Final fallback
    return 'User';
  };
  
  if (!isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <Lock className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                The full audit trail is for parents only. Switch to parent mode to access this feature.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to view their audit trail.</p>
      </div>
    );
  }

  const childEvents = pointEvents.filter(e => e.childId === child.id);
  
  const filteredEvents = childEvents.filter(event => {
    if (filter === 'adjustments') return event.isAdjustment;
    if (filter === 'recovery') return event.isRecovery;
    return true;
  });

  const adjustmentCount = childEvents.filter(e => e.isAdjustment).length;
  const recoveryCount = childEvents.filter(e => e.isRecovery).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Complete Audit Trail</CardTitle>
              <CardDescription>
                Full transparency of all point events for {child.name}
              </CardDescription>
            </div>
            <Filter className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All Events ({childEvents.length})</TabsTrigger>
              <TabsTrigger value="adjustments">Adjustments ({adjustmentCount})</TabsTrigger>
              <TabsTrigger value="recovery">Recovery ({recoveryCount})</TabsTrigger>
            </TabsList>

            <TabsContent value={filter} className="mt-6">
              {filteredEvents.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No events found</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Logged By</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.map((event) => {
                        const item = trackableItems.find(i => i.id === event.trackableItemId);
                        const itemName = item?.name || (event.isAdjustment ? 'Manual Adjustment' : event.isRecovery ? 'Recovery Bonus' : 'Unknown');
                        
                        return (
                          <TableRow key={event.id}>
                            <TableCell className="text-sm">
                              {format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{itemName}</span>
                                {item?.category && (
                                  <Badge variant="outline" className="w-fit text-xs">
                                    {item.category}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={event.points > 0 ? "default" : "destructive"}
                                className={event.points > 0 ? "bg-green-600" : ""}
                              >
                                {event.points > 0 ? '+' : ''}{event.points}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {event.isAdjustment && (
                                  <Badge variant="outline" className="w-fit bg-yellow-50">
                                    Adjustment
                                  </Badge>
                                )}
                                {event.isRecovery && (
                                  <Badge variant="outline" className="w-fit bg-green-50">
                                    Recovery
                                  </Badge>
                                )}
                                {!event.isAdjustment && !event.isRecovery && (
                                  <Badge variant="outline" className="w-fit">
                                    {item?.type || 'Standard'}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <span data-testid="audit-logged-by-display">
                                {getUserName(event)}
                              </span>
                              {event.editedBy && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Edited
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="text-sm">
                                {event.adjustmentReason && (
                                  <p className="text-yellow-800 bg-yellow-50 p-2 rounded text-xs mb-1">
                                    <span className="font-medium">Adjustment: </span>
                                    {event.adjustmentReason}
                                  </p>
                                )}
                                {event.notes && (
                                  <p className="text-muted-foreground italic">{event.notes}</p>
                                )}
                                {event.editReason && (
                                  <p className="text-blue-800 bg-blue-50 p-2 rounded text-xs mt-1">
                                    <span className="font-medium">Edit: </span>
                                    {event.editReason}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Governance Info */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="font-medium text-blue-900 mb-1">🔒 Full Transparency</p>
              <p className="text-sm text-blue-800">
                Every point change is logged with timestamp, parent attribution, and reason
              </p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="font-medium text-green-900 mb-1">✏️ Edit History</p>
              <p className="text-sm text-green-800">
                Any modifications are tracked with edit reason and editor identity
              </p>
            </div>
            
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="font-medium text-yellow-900 mb-1">📊 Complete Record</p>
              <p className="text-sm text-yellow-800">
                Filter by type to review adjustments, recoveries, or all events
              </p>
            </div>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 mt-4">
            <p className="font-medium text-purple-900 mb-2">Parent Conflict Prevention</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-purple-800">
              <li>Each event is owned by the logging parent</li>
              <li>Modifications require reason and both parent approval (in production)</li>
              <li>Duplicate detection prevents double-logging within time windows</li>
              <li>Adjustments are clearly marked and cannot be hidden</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}