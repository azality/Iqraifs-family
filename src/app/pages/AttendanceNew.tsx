import { useState, useEffect } from 'react';
import { motion } from "motion/react";
import { toast } from 'sonner';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { useFamily } from '../contexts/FamilyContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Calendar, Plus, Download, CheckCircle, XCircle, Edit, Trash2, Clock, MapPin, DollarSign, Check, X, FileDown, FileText, Sparkles, Pencil, Lock, CalendarDays } from 'lucide-react';
import { downloadMonthlyStatement, generateActivityStatement } from "../utils/attendancePdfExport";
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { AlertTriangle } from 'lucide-react';

// Attendance tracking for extracurricular activities
interface Provider {
  id: string;
  name: string;
  ratePerClass: number;
  description?: string;
  location?: string;
  dayOfWeek?: string[];
  time?: string;
  startDate?: string;
  endDate?: string;
  recurrenceWeeks?: number; // How many weeks this recurs
  color?: string;
  icon?: string;
}

interface AttendanceRecord {
  id: string;
  childId: string;
  providerId: string;
  classDate: string;
  status: 'present' | 'absent' | 'excused' | 'late'; // Changed from attended: boolean
  loggedBy: string;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ACTIVITY_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"];
const ACTIVITY_ICONS = ["⚽", "🏊", "🥋", "🎨", "🎸", "📚", "🎯", "⚡", "🏀", "🎭"];

export function AttendanceNew() {
  const { isParentMode, accessToken, refreshSession } = useAuth();
  const { getCurrentChild, attendanceRecords: contextAttendance, loading: familyLoading } = useFamily();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Provider management
  const [createProviderOpen, setCreateProviderOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerForm, setProviderForm] = useState({
    name: "",
    description: "",
    location: "",
    ratePerClass: 25,
    time: "",
    dayOfWeek: [] as string[],
    startDate: "",
    endDate: "",
    recurrenceWeeks: 1,
    color: ACTIVITY_COLORS[0],
    icon: ACTIVITY_ICONS[0]
  });
  
  // Attendance logging
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [attended, setAttended] = useState(true);
  
  const child = getCurrentChild();

  useEffect(() => {
    // Refresh session on mount to ensure we have a valid token
    const initSession = async () => {
      console.log('🔄 AttendanceNew: Initializing session...');
      await refreshSession();
    };
    
    initSession();
  }, []); // Run once on mount

  useEffect(() => {
    loadProviders();
    if (child) {
      loadAttendance();
    }
  }, [child, accessToken]); // Re-run when accessToken changes

  // Detect duplicate providers by name
  const duplicateProviders = providers.reduce((acc, provider, index, arr) => {
    const duplicates = arr.filter(p => p.name.toLowerCase().trim() === provider.name.toLowerCase().trim());
    if (duplicates.length > 1 && !acc.some(d => d.name.toLowerCase().trim() === provider.name.toLowerCase().trim())) {
      acc.push({ name: provider.name, count: duplicates.length, ids: duplicates.map(d => d.id) });
    }
    return acc;
  }, [] as Array<{ name: string; count: number; ids: string[] }>);

  const handleBulkDeleteDuplicates = async () => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      let deletedCount = 0;
      
      // For each duplicate group, keep the first one and delete the rest
      for (const dup of duplicateProviders) {
        const idsToDelete = dup.ids.slice(1); // Keep first, delete rest
        
        for (const id of idsToDelete) {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/providers/${id}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );
          
          if (response.ok) {
            deletedCount++;
          }
        }
      }
      
      toast.success(`Removed ${deletedCount} duplicate activit${deletedCount === 1 ? 'y' : 'ies'}!`);
      loadProviders();
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('Failed to remove duplicates');
    }
  };

  const loadProviders = async (retryCount = 0) => {
    if (!accessToken) {
      console.log('AttendanceNew: Waiting for authentication...');
      setLoading(false);
      return;
    }

    try {
      console.log('AttendanceNew: Loading providers with token:', accessToken?.substring(0, 20) + '...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/providers`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Provider load failed:', { status: response.status, error: errorText });
        
        // If 401 and haven't retried yet, refresh session and retry
        if (response.status === 401 && retryCount === 0) {
          console.log('🔄 Got 401, refreshing session and retrying...');
          toast.loading('Refreshing session...', { id: 'session-refresh' });
          await refreshSession();
          toast.dismiss('session-refresh');
          
          // Wait a moment for new token to be set
          setTimeout(() => loadProviders(1), 500);
          return;
        }
        
        throw new Error(`Failed to load providers: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      setProviders(data || []);
    } catch (error) {
      console.error('Load providers error:', error);
      
      if (retryCount === 0) {
        toast.error('Failed to load activities. Refreshing session...');
      } else {
        toast.error('Failed to load activities. Please try logging in again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAttendance = async (retryCount = 0) => {
    if (!child || !accessToken) return;
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/attendance`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      // Handle 401 by refreshing session
      if (response.status === 401 && retryCount === 0) {
        console.log('🔄 Got 401 on attendance, refreshing session and retrying...');
        await refreshSession();
        setTimeout(() => loadAttendance(1), 500);
        return;
      }
      
      const data = await response.json();
      
      // Ensure data is an array before setting state
      if (Array.isArray(data)) {
        setAttendanceRecords(data);
      } else {
        console.error('Attendance data is not an array:', data);
        setAttendanceRecords([]);
      }
    } catch (error) {
      console.error('Load attendance error:', error);
      setAttendanceRecords([]); // Set to empty array on error
    }
  };

  const handleCreateProvider = async () => {
    if (!providerForm.name.trim()) {
      toast.error('Please enter an activity name');
      return;
    }

    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/providers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(providerForm)
        }
      );

      if (response.ok) {
        toast.success('Activity created!');
        setCreateProviderOpen(false);
        resetProviderForm();
        loadProviders();
      }
    } catch (error) {
      console.error('Create provider error:', error);
      toast.error('Failed to create activity');
    }
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider || !providerForm.name.trim()) {
      toast.error('Please enter an activity name');
      return;
    }

    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/providers/${editingProvider.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(providerForm)
        }
      );

      if (response.ok) {
        toast.success('Activity updated!');
        setEditingProvider(null);
        setCreateProviderOpen(false); // Close the modal
        resetProviderForm();
        loadProviders();
      }
    } catch (error) {
      console.error('Update provider error:', error);
      toast.error('Failed to update activity');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/providers/${id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        toast.success('Activity deleted');
        loadProviders();
      }
    } catch (error) {
      console.error('Delete provider error:', error);
      toast.error('Failed to delete activity');
    }
  };

  const handleDeleteAttendance = async (id: string) => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/attendance/${id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        toast.success('Attendance record deleted');
        loadAttendance();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to delete attendance record');
      }
    } catch (error) {
      console.error('Delete attendance error:', error);
      toast.error('Failed to delete attendance record');
    }
  };

  const handleLogAttendance = async () => {
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    if (!selectedProvider) {
      toast.error("Please select an activity");
      return;
    }

    if (!child) {
      toast.error("Please select a child");
      return;
    }

    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      // Format date in local timezone to avoid timezone shift issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const classDate = `${year}-${month}-${day}`;
      
      // Check for duplicate attendance record
      const existingRecord = attendanceRecords.find(
        r => r.childId === child.id && 
             r.providerId === selectedProvider && 
             r.classDate === classDate
      );
      
      if (existingRecord) {
        const provider = providers.find(p => p.id === selectedProvider);
        const statusText = existingRecord.status === 'present' ? 'present' : 'absent';
        toast.error(
          `Attendance already logged for ${provider?.name} on ${format(selectedDate, 'MMM d, yyyy')} (marked as ${statusText}). Please delete the existing record first if you need to change it.`,
          { duration: 5000 }
        );
        return;
      }
      
      const requestBody = {
        childId: child.id,
        providerId: selectedProvider,
        classDate: classDate,
        status: attended ? 'present' : 'absent', // Changed from attended boolean to status string
        loggedBy: 'parent1'
      };
      
      console.log('📝 Logging attendance:', requestBody);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/attendance`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(requestBody)
        }
      );

      const responseData = await response.json();
      
      if (response.ok) {
        console.log('✅ Attendance logged successfully:', responseData);
        toast.success(`Attendance logged for ${child.name}`);
        setSelectedProvider("");
        loadAttendance();
      } else {
        console.error('❌ Attendance logging failed:', {
          status: response.status,
          statusText: response.statusText,
          error: responseData
        });
        
        // Show detailed error message
        const errorMsg = responseData.error || responseData.details?.join(', ') || responseData.errors?.join(', ') || 'Failed to log attendance';
        toast.error(`Error: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Log attendance error:', error);
      toast.error("Failed to log attendance");
    }
  };

  const resetProviderForm = () => {
    setProviderForm({
      name: "",
      description: "",
      location: "",
      ratePerClass: 25,
      time: "",
      dayOfWeek: [],
      startDate: "",
      endDate: "",
      recurrenceWeeks: 1,
      color: ACTIVITY_COLORS[0],
      icon: ACTIVITY_ICONS[0]
    });
  };

  const openEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setProviderForm({
      name: provider.name,
      description: provider.description || "",
      location: provider.location || "",
      ratePerClass: provider.ratePerClass,
      time: provider.time || "",
      dayOfWeek: provider.dayOfWeek || [],
      startDate: provider.startDate || "",
      endDate: provider.endDate || "",
      recurrenceWeeks: provider.recurrenceWeeks || 1,
      color: provider.color || ACTIVITY_COLORS[0],
      icon: provider.icon || ACTIVITY_ICONS[0]
    });
  };

  const toggleDayOfWeek = (day: string) => {
    setProviderForm(prev => ({
      ...prev,
      dayOfWeek: prev.dayOfWeek.includes(day)
        ? prev.dayOfWeek.filter(d => d !== day)
        : [...prev.dayOfWeek, day]
    }));
  };

  const calculateBilling = (providerId: string, startDate: Date, endDate: Date) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return 0;

    const records = attendanceRecords.filter(r => 
      r.childId === child?.id &&
      r.providerId === providerId &&
      r.status === 'present' && // Changed from r.attended to r.status === 'present'
      new Date(r.classDate) >= startDate &&
      new Date(r.classDate) <= endDate
    );

    return records.length * provider.ratePerClass;
  };

  // Weekly Schedule View
  const renderWeeklySchedule = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday

    return (
      <Card className={isParentMode ? "" : "bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200 shadow-lg"}>
        <CardHeader>
          <CardTitle className={isParentMode ? "flex items-center gap-2" : "flex items-center gap-2 text-purple-900"}>
            <CalendarDays className={isParentMode ? "h-5 w-5" : "h-5 w-5 text-purple-600"} />
            {isParentMode ? "Weekly Activity Schedule" : "📅 My Weekly Schedule!"}
          </CardTitle>
          <CardDescription className={isParentMode ? "" : "text-purple-700 font-medium"}>
            {isParentMode ? "Activities scheduled for this week" : "Check out all your fun activities! 🎉"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {DAYS_OF_WEEK.map((day, index) => {
              const dayActivities = providers.filter(p => p.dayOfWeek?.includes(day));
              const dayDate = addDays(weekStart, index);
              const isToday = format(dayDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

              return (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-lg border-2 ${isToday ? 'bg-yellow-50 border-yellow-400' : 'bg-white border-gray-200'}`}
                >
                  <div className="text-center mb-3">
                    <div className={`font-bold text-sm ${isToday ? 'text-yellow-900' : 'text-gray-700'}`}>
                      {day.substring(0, 3)}
                    </div>
                    <div className={`text-xs ${isToday ? 'text-yellow-700' : 'text-gray-500'}`}>
                      {format(dayDate, 'MMM d')}
                    </div>
                    {isToday && <Badge className="mt-1 text-xs bg-yellow-500">Today!</Badge>}
                  </div>
                  
                  <div className="space-y-2">
                    {dayActivities.length === 0 ? (
                      <div className="text-center py-4">
                        <span className="text-2xl">😴</span>
                        <p className="text-xs text-gray-400 mt-1">Free day!</p>
                      </div>
                    ) : (
                      dayActivities.map(activity => (
                        <div
                          key={activity.id}
                          className="p-2 rounded-md shadow-sm"
                          style={{ backgroundColor: activity.color + '20', borderLeft: `3px solid ${activity.color}` }}
                        >
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-lg">{activity.icon}</span>
                            <span className="text-xs font-semibold truncate">{activity.name}</span>
                          </div>
                          {activity.time && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <Clock className="h-3 w-3" />
                              <span>{activity.time}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!isParentMode && child) {
    // Child view - show weekly schedule only
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-8 text-white shadow-2xl"
        >
          <div className="relative z-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-2">
              🎯 {child.name}'s Activities! 🌟
            </h1>
            <p className="text-xl md:text-2xl opacity-90">
              Check out your awesome weekly schedule below! 🚀
            </p>
          </div>
          <motion.div
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute top-10 right-10 text-6xl"
          >
            📚
          </motion.div>
          <motion.div
            animate={{ y: [0, 20, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute bottom-10 left-20 text-5xl"
          >
            ⚽
          </motion.div>
        </motion.div>

        {renderWeeklySchedule()}
      </div>
    );
  }

  if (!isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <Lock className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                Only parents can track attendance. Switch to parent mode to access this feature.
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
        <p className="text-muted-foreground">Please select a child to manage attendance.</p>
      </div>
    );
  }

  if (loading || familyLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Attendance & Activities</h1>
          <p className="text-muted-foreground mt-1">
            Manage {child.name}'s activity schedule and attendance
          </p>
        </div>

        <Dialog open={createProviderOpen} onOpenChange={setCreateProviderOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProvider ? "Edit Activity" : "Add New Activity"}</DialogTitle>
              <DialogDescription>
                Create a new activity or class for tracking attendance
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Activity Name *</Label>
                  <Input
                    id="name"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder="e.g., Karate Class, Swimming"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={providerForm.description}
                    onChange={(e) => setProviderForm({ ...providerForm, description: e.target.value })}
                    placeholder="Brief description of the activity"
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={providerForm.location}
                    onChange={(e) => setProviderForm({ ...providerForm, location: e.target.value })}
                    placeholder="e.g., Community Center, Online"
                  />
                </div>

                <div>
                  <Label htmlFor="rate">Rate per Class ($)</Label>
                  <Input
                    id="rate"
                    type="number"
                    value={providerForm.ratePerClass}
                    onChange={(e) => setProviderForm({ ...providerForm, ratePerClass: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    value={providerForm.time}
                    onChange={(e) => setProviderForm({ ...providerForm, time: e.target.value })}
                    placeholder="e.g., 4:00 PM - 5:00 PM"
                  />
                </div>

                <div className="col-span-2">
                  <Label>Days of Week</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DAYS_OF_WEEK.map(day => (
                      <Button
                        key={day}
                        type="button"
                        variant={providerForm.dayOfWeek.includes(day) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleDayOfWeek(day)}
                      >
                        {day.substring(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Recurring Schedule Section */}
                <div className="col-span-2 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <Label className="text-blue-900 font-semibold">Recurring Schedule (Optional)</Label>
                  </div>
                  <p className="text-sm text-blue-800 mb-3">
                    Set a specific date range for this activity. Example: Swimming every Friday at 5:40pm for next 3 weeks.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="startDate" className="text-sm">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={providerForm.startDate}
                        onChange={(e) => setProviderForm({ ...providerForm, startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="endDate" className="text-sm">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={providerForm.endDate}
                        onChange={(e) => setProviderForm({ ...providerForm, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="recurrenceWeeks" className="text-sm">Number of Weeks</Label>
                    <Input
                      id="recurrenceWeeks"
                      type="number"
                      min="1"
                      max="52"
                      value={providerForm.recurrenceWeeks}
                      onChange={(e) => setProviderForm({ ...providerForm, recurrenceWeeks: parseInt(e.target.value) || 1 })}
                      placeholder="e.g., 3 for 3 weeks"
                    />
                    <p className="text-xs text-blue-700 mt-1">
                      How many weeks will this activity repeat?
                    </p>
                  </div>
                </div>

                <div>
                  <Label>Icon</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ACTIVITY_ICONS.map(icon => (
                      <Button
                        key={icon}
                        type="button"
                        variant={providerForm.icon === icon ? "default" : "outline"}
                        size="sm"
                        onClick={() => setProviderForm({ ...providerForm, icon })}
                        className="text-lg"
                      >
                        {icon}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ACTIVITY_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${providerForm.color === color ? 'border-black scale-110' : 'border-gray-300'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setProviderForm({ ...providerForm, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateProviderOpen(false);
                    setEditingProvider(null);
                    resetProviderForm();
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingProvider ? handleUpdateProvider : handleCreateProvider}>
                  {editingProvider ? "Update" : "Create"} Activity
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Duplicate Activities Warning */}
      {duplicateProviders.length > 0 && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-50 text-orange-900">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-900">Duplicate Activities Detected</AlertTitle>
          <AlertDescription className="text-orange-800">
            <p className="mb-2">You have duplicate activities with the same name. This may cause confusion in tracking and billing:</p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              {duplicateProviders.map(dup => (
                <li key={dup.name}>
                  <strong>{dup.name}</strong> appears {dup.count} times
                </li>
              ))}
            </ul>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 bg-white border-orange-300 text-orange-900 hover:bg-orange-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Clean Up Duplicates
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove All Duplicates?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div>
                      This will keep one copy of each activity and delete all duplicates. This action cannot be undone.
                      <div className="mt-3 p-3 bg-gray-50 rounded-md">
                        <p className="font-semibold text-sm mb-1">Will be removed:</p>
                        <ul className="text-sm space-y-1">
                          {duplicateProviders.map(dup => (
                            <li key={dup.name}>
                              • {dup.count - 1} duplicate{dup.count - 1 > 1 ? 's' : ''} of <strong>{dup.name}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDeleteDuplicates} className="bg-orange-600 hover:bg-orange-700">
                    Remove Duplicates
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </AlertDescription>
        </Alert>
      )}

      {/* Weekly Schedule */}
      {renderWeeklySchedule()}

      {/* Activity Management */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Activities</CardTitle>
          <CardDescription>View and edit all activities</CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No activities created yet. Add your first activity!</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {providers.map(provider => (
                <Card key={provider.id} className="border-l-4" style={{ borderLeftColor: provider.color }}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{provider.icon}</span>
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            openEditProvider(provider);
                            setCreateProviderOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Activity?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this activity.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteProvider(provider.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {provider.description && (
                      <p className="text-muted-foreground">{provider.description}</p>
                    )}
                    {provider.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{provider.location}</span>
                      </div>
                    )}
                    {provider.time && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{provider.time}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>${provider.ratePerClass} per class</span>
                    </div>
                    {provider.dayOfWeek && provider.dayOfWeek.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {provider.dayOfWeek.map(day => (
                          <Badge key={day} variant="secondary" className="text-xs">
                            {day.substring(0, 3)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Attendance & Billing */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Log Attendance */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Log Attendance</CardTitle>
            <CardDescription>Record class attendance for {child.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class Date</Label>
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border w-full"
                  modifiers={{
                    hasAttendance: attendanceRecords
                      .filter(r => r.childId === child.id)
                      .map(r => {
                        // Parse date string without timezone conversion
                        const [year, month, day] = r.classDate.split('-').map(Number);
                        return new Date(year, month - 1, day);
                      })
                  }}
                  modifiersClassNames={{
                    hasAttendance: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-blue-600 after:rounded-full"
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">Activity</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger id="provider">
                      <SelectValue placeholder="Select activity..." />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map(provider => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.icon} {provider.name} - ${provider.ratePerClass}/class
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={attended ? "default" : "outline"}
                      onClick={() => setAttended(true)}
                      className="flex-1"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Present
                    </Button>
                    <Button
                      variant={!attended ? "destructive" : "outline"}
                      onClick={() => setAttended(false)}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Absent
                    </Button>
                  </div>
                </div>

                <Button onClick={handleLogAttendance} className="w-full">
                  Log Attendance
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Billing Summary */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Monthly Billing Summary</CardTitle>
                <CardDescription>Current month attendance costs</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const now = new Date();
                  const monthName = format(now, 'MMMM');
                  const year = format(now, 'yyyy');
                  
                  downloadMonthlyStatement({
                    childName: child.name,
                    month: monthName,
                    year: year,
                    providers: providers,
                    attendanceRecords: attendanceRecords.filter(r => {
                      const recordDate = new Date(r.classDate);
                      return recordDate.getMonth() === now.getMonth() && 
                             recordDate.getFullYear() === now.getFullYear();
                    }),
                    familyName: "Your Family"
                  });
                  toast.success("PDF statement generated!");
                }}
              >
                <FileDown className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.map(provider => {
              const now = new Date();
              const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
              const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
              const cost = calculateBilling(provider.id, monthStart, monthEnd);
              const count = attendanceRecords.filter(r => 
                r.childId === child.id &&
                r.providerId === provider.id &&
                r.status === 'present' && // Changed from r.attended
                new Date(r.classDate) >= monthStart &&
                new Date(r.classDate) <= monthEnd
              ).length;

              return (
                <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg border-l-4" style={{ borderLeftColor: provider.color }}>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xl">{provider.icon}</span>
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {count} classes × ${provider.ratePerClass}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-lg">
                      ${cost}
                    </Badge>
                    {count > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const now = new Date();
                          const monthStart = startOfMonth(now);
                          const monthEnd = endOfMonth(now);
                          const providerRecords = attendanceRecords.filter(r => 
                            r.providerId === provider.id &&
                            new Date(r.classDate) >= monthStart &&
                            new Date(r.classDate) <= monthEnd
                          );
                          
                          generateActivityStatement(
                            child.name,
                            provider,
                            providerRecords,
                            monthStart,
                            monthEnd
                          );
                          toast.success(`${provider.name} statement generated!`);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="font-bold">Total for {format(new Date(), 'MMMM yyyy')}</p>
                <Badge className="text-lg">
                  ${providers.reduce((sum, p) => {
                    const now = new Date();
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    return sum + calculateBilling(p.id, monthStart, monthEnd);
                  }, 0)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance History */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance History</CardTitle>
          <CardDescription>Recent class attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          {attendanceRecords.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No attendance records yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceRecords.slice(0, 10).map((record) => {
                  const provider = providers.find(p => p.id === record.providerId);
                  // Parse date string directly to avoid timezone conversion
                  const [year, month, day] = record.classDate.split('-').map(Number);
                  const displayDate = new Date(year, month - 1, day);
                  
                  return (
                    <TableRow key={record.id}>
                      <TableCell>{format(displayDate, 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{provider?.icon}</span>
                          <span>{provider?.name || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.status === 'present' ? "default" : "destructive"}>
                          {record.status === 'present' ? 'Present' : 'Absent'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.status === 'present' ? `$${provider?.ratePerClass || 0}` : '$0'}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2 bg-white border-red-300 text-red-900 hover:bg-red-100"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Attendance Record?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this attendance record.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteAttendance(record.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}