import { Award, TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle, XCircle, Calendar, Activity, Sparkles, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function WeeklyReview() {
  const { isParentMode } = useAuth();
  const { getCurrentChild, pointEvents } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const child = getCurrentChild();

  if (!isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <Award className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                Weekly reviews are for parents only. Switch to parent mode to access this feature.
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
        <p className="text-muted-foreground">Please select a child to view their weekly review.</p>
      </div>
    );
  }

  // Get events from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const weekEvents = pointEvents.filter(e => {
    return e.childId === child.id && new Date(e.timestamp) >= sevenDaysAgo;
  });

  const positiveEvents = weekEvents.filter(e => e.points > 0);
  const negativeEvents = weekEvents.filter(e => e.points < 0);

  const totalPositive = positiveEvents.reduce((sum, e) => sum + e.points, 0);
  const totalNegative = Math.abs(negativeEvents.reduce((sum, e) => sum + e.points, 0));
  const ratio = totalNegative > 0 ? (totalPositive / totalNegative).toFixed(1) : 'Perfect';

  // Group by behavior type
  const behaviorCounts: Record<string, { name: string; count: number; points: number; positive: boolean }> = {};
  
  weekEvents.forEach(event => {
    const item = trackableItems.find(i => i.id === event.trackableItemId);
    if (item) {
      if (!behaviorCounts[item.id]) {
        behaviorCounts[item.id] = {
          name: item.name,
          count: 0,
          points: 0,
          positive: item.points > 0
        };
      }
      behaviorCounts[item.id].count++;
      behaviorCounts[item.id].points += event.points;
    }
  });

  const sortedBehaviors = Object.values(behaviorCounts).sort((a, b) => b.count - a.count);
  const topStrengths = sortedBehaviors.filter(b => b.positive).slice(0, 3);
  const topChallenges = sortedBehaviors.filter(b => !b.positive).slice(0, 3);

  // Daily breakdown for chart
  const dailyData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayEvents = weekEvents.filter(e => {
      const eventDate = new Date(e.timestamp);
      return eventDate.toDateString() === date.toDateString();
    });
    
    const dayPositive = dayEvents.filter(e => e.points > 0).reduce((sum, e) => sum + e.points, 0);
    const dayNegative = Math.abs(dayEvents.filter(e => e.points < 0).reduce((sum, e) => sum + e.points, 0));
    
    dailyData.push({
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      positive: dayPositive,
      negative: dayNegative
    });
  }

  const pieData = [
    { name: 'Positive', value: totalPositive, color: '#22c55e' },
    { name: 'Negative', value: totalNegative, color: '#ef4444' }
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Positive Events</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">+{totalPositive}</div>
            <p className="text-xs text-muted-foreground">{positiveEvents.length} events</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Challenges</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">-{totalNegative}</div>
            <p className="text-xs text-muted-foreground">{negativeEvents.length} events</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Ratio</CardTitle>
            <Award className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ratio}:1</div>
            <p className="text-xs text-muted-foreground">
              {typeof ratio === 'number' && ratio >= 3 ? '🎉 Excellent!' : 'Positive to negative'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Breakdown</CardTitle>
            <CardDescription>Points earned and lost each day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="positive" fill="#22c55e" name="Positive" />
                <Bar dataKey="negative" fill="#ef4444" name="Negative" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overall Balance</CardTitle>
            <CardDescription>Positive vs negative distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Strengths and Challenges */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 3 Strengths</CardTitle>
            <CardDescription>Most consistent positive behaviors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topStrengths.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No positive behaviors this week</p>
              ) : (
                topStrengths.map((behavior, index) => (
                  <div key={behavior.name} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <div>
                        <p className="font-medium">{behavior.name}</p>
                        <p className="text-sm text-muted-foreground">{behavior.count} times</p>
                      </div>
                    </div>
                    <Badge className="bg-green-600">+{behavior.points}</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 3 Challenges</CardTitle>
            <CardDescription>Areas for improvement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topChallenges.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No challenges this week! 🎉</p>
              ) : (
                topChallenges.map((behavior, index) => (
                  <div key={behavior.name} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <div>
                        <p className="font-medium">{behavior.name}</p>
                        <p className="text-sm text-muted-foreground">{behavior.count} times</p>
                      </div>
                    </div>
                    <Badge variant="destructive">{behavior.points}</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Family Meeting Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Family Meeting Discussion Points</CardTitle>
          <CardDescription>Use these insights for your weekly family review</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="font-medium text-green-900 mb-2">🎉 Celebrate:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
              {topStrengths.length > 0 ? (
                topStrengths.map(s => (
                  <li key={s.name}>Great consistency with {s.name} ({s.count} times this week!)</li>
                ))
              ) : (
                <li>Keep up the good work and build positive habits!</li>
              )}
            </ul>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="font-medium text-blue-900 mb-2">💪 Growth Goals:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
              {topChallenges.length > 0 ? (
                topChallenges.map(c => (
                  <li key={c.name}>Let's work together on reducing {c.name}</li>
                ))
              ) : (
                <li>Continue building on your excellent progress!</li>
              )}
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="font-medium text-yellow-900 mb-2">📊 Overall Assessment:</p>
            <p className="text-sm text-yellow-800">
              {typeof ratio === 'number' && ratio >= 3 
                ? `Outstanding week! ${child.name} maintained an excellent positive-to-negative ratio of ${ratio}:1.`
                : typeof ratio === 'number' && ratio >= 2
                ? `Good week! ${child.name} is making progress with a ${ratio}:1 ratio. Let's aim for 3:1 next week.`
                : ratio === 'Perfect'
                ? `Perfect week! No negative behaviors recorded. Keep it up! 🌟`
                : `Let's focus on building more positive habits this week to improve the balance.`
              }
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}