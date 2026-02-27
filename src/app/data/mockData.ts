// Mock data structure for Family Growth System

export type UserRole = 'parent' | 'child';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  familyId: string;
}

export interface Child {
  id: string;
  name: string;
  familyId: string;
  currentPoints: number;
  highestMilestone: number;
  targetRewardId?: string;
  dailyPointsEarned?: number; // Track daily points for cap enforcement
  dailyPointsCap?: number; // Custom cap per child (default 50)
  lastResetDate?: string; // Track when daily points were last reset
  currentStreak?: { [itemId: string]: number }; // Track current streaks by item
  longestStreak?: { [itemId: string]: number }; // Track longest streaks by item
}

export interface TrackableItem {
  id: string;
  name: string;
  type: 'habit' | 'behavior';
  category?: 'salah' | 'quran' | 'homework' | 'general';
  points: number;
  tier?: 'minor' | 'moderate' | 'major';
  dedupeWindow?: number; // minutes
  isReligious?: boolean;
  religiousGuardrailMode?: 'positive-only' | 'streak-only' | 'full-tracking' | 'disabled';
}

export interface PointEvent {
  id: string;
  childId: string;
  trackableItemId: string;
  points: number;
  timestamp: Date;
  loggedBy: string;
  editedBy?: string;
  editReason?: string;
  isAdjustment?: boolean;
  adjustmentReason?: string;
  isRecovery?: boolean;
  recoveryFromEventId?: string; // Links to the negative event being recovered from
  recoveryAction?: 'apology' | 'reflection' | 'correction'; // Type of recovery
  recoveryNotes?: string; // Child's apology/reflection text
  notes?: string;
}

export interface Milestone {
  id: string;
  points: number;
  name: string;
  unlocked?: boolean;
}

export interface Reward {
  id: string;
  name: string;
  category: 'small' | 'medium' | 'large';
  pointCost: number;
  description?: string;
}

export interface Redemption {
  id: string;
  childId: string;
  rewardId: string;
  pointsSpent: number;
  redeemedAt: Date;
  approvedBy: string;
}

export interface AttendanceRecord {
  id: string;
  childId: string;
  providerId: string;
  classDate: Date;
  attended: boolean;
  loggedBy: string;
}

export interface Provider {
  id: string;
  name: string;
  ratePerClass: number;
  description?: string;
  location?: string;
  dayOfWeek?: string[]; // e.g., ["Monday", "Wednesday", "Friday"]
  time?: string; // e.g., "4:00 PM - 5:00 PM"
  color?: string; // For visual differentiation in weekly view
  icon?: string; // Emoji icon for the activity
}

export interface WeeklySnapshot {
  id: string;
  childId: string;
  weekStart: Date;
  weekEnd: Date;
  totalPositive: number;
  totalNegative: number;
  ratio: number;
  topStrengths: string[];
  topChallenges: string[];
}

// Mock Data
export const currentUser: User = {
  id: 'parent1',
  name: 'Ahmad',
  role: 'parent',
  familyId: 'family1'
};

export const parents: User[] = [
  currentUser,
  {
    id: 'parent2',
    name: 'Fatima',
    role: 'parent',
    familyId: 'family1'
  }
];

export const children: Child[] = [
  {
    id: 'child1',
    name: 'Yusuf',
    familyId: 'family1',
    currentPoints: 245,
    highestMilestone: 250,
    targetRewardId: 'reward2',
    dailyPointsEarned: 20,
    dailyPointsCap: 50,
    lastResetDate: '2026-02-16',
    currentStreak: { 'item1': 3, 'item7': 2 },
    longestStreak: { 'item1': 5, 'item7': 3 }
  },
  {
    id: 'child2',
    name: 'Maryam',
    familyId: 'family1',
    currentPoints: 420,
    highestMilestone: 500
  }
];

export const trackableItems: TrackableItem[] = [
  // Salah (Habits)
  { id: 'item1', name: 'Fajr', type: 'habit', category: 'salah', points: 5, isReligious: true, religiousGuardrailMode: 'full-tracking' },
  { id: 'item2', name: 'Dhuhr', type: 'habit', category: 'salah', points: 3, isReligious: true, religiousGuardrailMode: 'full-tracking' },
  { id: 'item3', name: 'Asr', type: 'habit', category: 'salah', points: 3, isReligious: true, religiousGuardrailMode: 'full-tracking' },
  { id: 'item4', name: 'Maghrib', type: 'habit', category: 'salah', points: 3, isReligious: true, religiousGuardrailMode: 'full-tracking' },
  { id: 'item5', name: 'Isha', type: 'habit', category: 'salah', points: 3, isReligious: true, religiousGuardrailMode: 'full-tracking' },
  
  // Other Habits
  { id: 'item6', name: 'Quran Reading', type: 'habit', category: 'quran', points: 5, isReligious: true, religiousGuardrailMode: 'full-tracking' },
  { id: 'item7', name: 'Homework Complete', type: 'habit', category: 'homework', points: 10 },
  
  // Negative Behaviors
  { id: 'item8', name: 'Tantrum', type: 'behavior', tier: 'minor', points: -3, dedupeWindow: 15 },
  { id: 'item9', name: 'Disrespect', type: 'behavior', tier: 'moderate', points: -5, dedupeWindow: 30 },
  { id: 'item10', name: 'Lying', type: 'behavior', tier: 'major', points: -10, dedupeWindow: 60 },
  { id: 'item11', name: 'Fighting', type: 'behavior', tier: 'moderate', points: -5, dedupeWindow: 20 },
  
  // Positive Behaviors
  { id: 'item12', name: 'Helped Sibling', type: 'behavior', points: 5 },
  { id: 'item13', name: 'Cleaned Room', type: 'behavior', points: 3 },
];

export const pointEvents: PointEvent[] = [
  {
    id: 'event1',
    childId: 'child1',
    trackableItemId: 'item1',
    points: 5,
    timestamp: new Date('2026-02-17T05:30:00'),
    loggedBy: 'parent1',
    notes: 'On time!'
  },
  {
    id: 'event2',
    childId: 'child1',
    trackableItemId: 'item7',
    points: 10,
    timestamp: new Date('2026-02-16T19:00:00'),
    loggedBy: 'parent2'
  },
  {
    id: 'event3',
    childId: 'child1',
    trackableItemId: 'item8',
    points: -3,
    timestamp: new Date('2026-02-16T14:30:00'),
    loggedBy: 'parent1'
  },
  {
    id: 'event4',
    childId: 'child2',
    trackableItemId: 'item1',
    points: 5,
    timestamp: new Date('2026-02-17T05:35:00'),
    loggedBy: 'parent2'
  },
  {
    id: 'event5',
    childId: 'child2',
    trackableItemId: 'item12',
    points: 5,
    timestamp: new Date('2026-02-16T12:00:00'),
    loggedBy: 'parent1',
    notes: 'Helped Yusuf with homework'
  },
  {
    id: 'event6',
    childId: 'child1',
    trackableItemId: 'item10',
    points: -10,
    timestamp: new Date('2026-02-15T16:00:00'),
    loggedBy: 'parent2',
    notes: 'Lied about finishing homework'
  },
  {
    id: 'event7',
    childId: 'child1',
    trackableItemId: 'recovery1',
    points: 3,
    timestamp: new Date('2026-02-15T18:00:00'),
    loggedBy: 'parent2',
    isRecovery: true,
    recoveryFromEventId: 'event6',
    recoveryAction: 'apology',
    recoveryNotes: 'Apologized sincerely and completed homework',
    notes: 'Apologized sincerely and completed homework'
  },
];

export const milestones: Milestone[] = [
  { id: 'mile1', points: 100, name: 'Bronze Achiever', unlocked: true },
  { id: 'mile2', points: 250, name: 'Silver Star', unlocked: true },
  { id: 'mile3', points: 500, name: 'Gold Champion', unlocked: false },
  { id: 'mile4', points: 1000, name: 'Diamond Leader', unlocked: false },
];

export const rewards: Reward[] = [
  { id: 'reward1', name: 'Extra Screen Time (30min)', category: 'small', pointCost: 50 },
  { id: 'reward2', name: 'Lego Set', category: 'medium', pointCost: 200, description: 'Star Wars Lego' },
  { id: 'reward3', name: 'Ice Cream Outing', category: 'small', pointCost: 75 },
  { id: 'reward4', name: 'New Book', category: 'small', pointCost: 60 },
  { id: 'reward5', name: 'Theme Park Visit', category: 'large', pointCost: 500 },
  { id: 'reward6', name: 'Gaming Console', category: 'large', pointCost: 1000 },
];

export const providers: Provider[] = [
  { id: 'prov1', name: 'Quran Academy', ratePerClass: 25, description: 'Learn Quran with expert tutors', location: 'Online', dayOfWeek: ['Monday', 'Wednesday', 'Friday'], time: '4:00 PM - 5:00 PM', color: '#FF5733', icon: '📚' },
  { id: 'prov2', name: 'Arabic Tutoring', ratePerClass: 30, description: 'Improve Arabic skills with professional tutors', location: 'Online', dayOfWeek: ['Tuesday', 'Thursday'], time: '3:00 PM - 4:00 PM', color: '#33FF57', icon: ' العربية' },
];

export const attendanceRecords: AttendanceRecord[] = [
  {
    id: 'att1',
    childId: 'child1',
    providerId: 'prov1',
    classDate: new Date('2026-02-15'),
    attended: true,
    loggedBy: 'parent1'
  },
  {
    id: 'att2',
    childId: 'child1',
    providerId: 'prov1',
    classDate: new Date('2026-02-12'),
    attended: true,
    loggedBy: 'parent1'
  },
  {
    id: 'att3',
    childId: 'child2',
    providerId: 'prov2',
    classDate: new Date('2026-02-14'),
    attended: false,
    loggedBy: 'parent2'
  },
];

export const weeklySnapshots: WeeklySnapshot[] = [
  {
    id: 'snap1',
    childId: 'child1',
    weekStart: new Date('2026-02-10'),
    weekEnd: new Date('2026-02-16'),
    totalPositive: 45,
    totalNegative: -18,
    ratio: 2.5,
    topStrengths: ['Fajr consistency', 'Homework completion', 'Helping siblings'],
    topChallenges: ['Tantrums after school', 'Room cleanliness']
  }
];

// ===== CHALLENGE SYSTEM =====

export type ChallengeType = 'daily' | 'weekly';
export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';
export type ChallengeStatus = 'available' | 'accepted' | 'completed' | 'failed' | 'expired';

export interface Challenge {
  id: string;
  childId: string;
  templateId: string;
  type: ChallengeType;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  bonusPoints: number;
  status: ChallengeStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  requirements: ChallengeRequirement[];
  progress: ChallengeProgress;
  icon?: string;
}

export interface ChallengeRequirement {
  type: 'count' | 'streak' | 'total-points' | 'specific-items';
  target: number;
  itemIds?: string[]; // For specific-items type
  description: string;
}

export interface ChallengeProgress {
  current: number;
  target: number;
  percentage: number;
  isComplete: boolean;
}

export interface ChallengeTemplate {
  id: string;
  type: ChallengeType;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  bonusPoints: number;
  requirements: ChallengeRequirement[];
  icon: string;
  category?: 'salah' | 'general' | 'social' | 'learning';
}

// Challenge Templates
export const challengeTemplates: ChallengeTemplate[] = [
  // Daily Challenges - Easy
  {
    id: 'tpl_daily_fajr',
    type: 'daily',
    title: '🌅 Early Riser',
    description: 'Pray Fajr on time today',
    difficulty: 'easy',
    bonusPoints: 5,
    category: 'salah',
    icon: '🌅',
    requirements: [{
      type: 'specific-items',
      target: 1,
      itemIds: ['item1'],
      description: 'Complete Fajr prayer'
    }]
  },
  {
    id: 'tpl_daily_help',
    type: 'daily',
    title: '🤝 Helpful Hero',
    description: 'Help a family member today',
    difficulty: 'easy',
    bonusPoints: 3,
    category: 'social',
    icon: '🤝',
    requirements: [{
      type: 'specific-items',
      target: 1,
      itemIds: ['item12'],
      description: 'Help a sibling or parent'
    }]
  },
  {
    id: 'tpl_daily_clean',
    type: 'daily',
    title: '✨ Clean Sweep',
    description: 'Clean your room without being asked',
    difficulty: 'easy',
    bonusPoints: 3,
    category: 'general',
    icon: '✨',
    requirements: [{
      type: 'specific-items',
      target: 1,
      itemIds: ['item13'],
      description: 'Clean your room'
    }]
  },

  // Daily Challenges - Medium
  {
    id: 'tpl_daily_all_salah',
    type: 'daily',
    title: '🕌 Prayer Warrior',
    description: 'Pray all 5 daily prayers on time',
    difficulty: 'medium',
    bonusPoints: 10,
    category: 'salah',
    icon: '🕌',
    requirements: [{
      type: 'specific-items',
      target: 5,
      itemIds: ['item1', 'item2', 'item3', 'item4', 'item5'],
      description: 'Complete all 5 prayers'
    }]
  },
  {
    id: 'tpl_daily_positive_day',
    type: 'daily',
    title: '😇 Perfect Behavior',
    description: 'Go the whole day with no negative behaviors',
    difficulty: 'medium',
    bonusPoints: 8,
    category: 'general',
    icon: '😇',
    requirements: [{
      type: 'count',
      target: 0,
      description: 'Zero negative events today'
    }]
  },

  // Daily Challenges - Hard
  {
    id: 'tpl_daily_super_day',
    type: 'daily',
    title: '🌟 Super Star Day',
    description: 'Earn 30+ points in positive actions today',
    difficulty: 'hard',
    bonusPoints: 15,
    category: 'general',
    icon: '🌟',
    requirements: [{
      type: 'total-points',
      target: 30,
      description: 'Earn 30 points from positive actions'
    }]
  },

  // Weekly Challenges - Easy
  {
    id: 'tpl_weekly_quran',
    type: 'weekly',
    title: '📖 Quran Reader',
    description: 'Read Quran 5 times this week',
    difficulty: 'easy',
    bonusPoints: 10,
    category: 'learning',
    icon: '📖',
    requirements: [{
      type: 'specific-items',
      target: 5,
      itemIds: ['item6'],
      description: 'Complete Quran reading 5 times'
    }]
  },
  {
    id: 'tpl_weekly_homework',
    type: 'weekly',
    title: '📚 Study Champion',
    description: 'Complete homework on time every day this week',
    difficulty: 'easy',
    bonusPoints: 12,
    category: 'learning',
    icon: '📚',
    requirements: [{
      type: 'specific-items',
      target: 5,
      itemIds: ['item7'],
      description: 'Complete homework 5 times'
    }]
  },

  // Weekly Challenges - Medium
  {
    id: 'tpl_weekly_fajr_streak',
    type: 'weekly',
    title: '🔥 Fajr Streak Master',
    description: 'Pray Fajr every day this week (7 days)',
    difficulty: 'medium',
    bonusPoints: 20,
    category: 'salah',
    icon: '🔥',
    requirements: [{
      type: 'streak',
      target: 7,
      itemIds: ['item1'],
      description: 'Maintain 7-day Fajr streak'
    }]
  },
  {
    id: 'tpl_weekly_helper',
    type: 'weekly',
    title: '💪 Helping Hand Hero',
    description: 'Help others 10 times this week',
    difficulty: 'medium',
    bonusPoints: 15,
    category: 'social',
    icon: '💪',
    requirements: [{
      type: 'specific-items',
      target: 10,
      itemIds: ['item12'],
      description: 'Help 10 times'
    }]
  },

  // Weekly Challenges - Hard
  {
    id: 'tpl_weekly_perfect',
    type: 'weekly',
    title: '🏆 Perfect Week',
    description: 'Complete all prayers, homework, and have zero negative behaviors',
    difficulty: 'hard',
    bonusPoints: 50,
    category: 'general',
    icon: '🏆',
    requirements: [
      {
        type: 'specific-items',
        target: 35,
        itemIds: ['item1', 'item2', 'item3', 'item4', 'item5'],
        description: 'All prayers (5×7 = 35)'
      },
      {
        type: 'specific-items',
        target: 5,
        itemIds: ['item7'],
        description: 'All homework (5 days)'
      },
      {
        type: 'count',
        target: 0,
        description: 'Zero negative behaviors'
      }
    ]
  }
];

// Mock active challenges
export const activeChallenges: Challenge[] = [
  {
    id: 'chal1',
    childId: 'child1',
    templateId: 'tpl_daily_all_salah',
    type: 'daily',
    title: '🕌 Prayer Warrior',
    description: 'Pray all 5 daily prayers on time',
    difficulty: 'medium',
    bonusPoints: 10,
    status: 'accepted',
    createdAt: new Date('2026-02-18T00:00:00'),
    expiresAt: new Date('2026-02-18T23:59:59'),
    acceptedAt: new Date('2026-02-18T06:00:00'),
    icon: '🕌',
    requirements: [{
      type: 'specific-items',
      target: 5,
      itemIds: ['item1', 'item2', 'item3', 'item4', 'item5'],
      description: 'Complete all 5 prayers'
    }],
    progress: {
      current: 2,
      target: 5,
      percentage: 40,
      isComplete: false
    }
  },
  {
    id: 'chal2',
    childId: 'child1',
    templateId: 'tpl_daily_help',
    type: 'daily',
    title: '🤝 Helpful Hero',
    description: 'Help a family member today',
    difficulty: 'easy',
    bonusPoints: 3,
    status: 'available',
    createdAt: new Date('2026-02-18T00:00:00'),
    expiresAt: new Date('2026-02-18T23:59:59'),
    icon: '🤝',
    requirements: [{
      type: 'specific-items',
      target: 1,
      itemIds: ['item12'],
      description: 'Help a sibling or parent'
    }],
    progress: {
      current: 0,
      target: 1,
      percentage: 0,
      isComplete: false
    }
  },
  {
    id: 'chal3',
    childId: 'child1',
    templateId: 'tpl_weekly_fajr_streak',
    type: 'weekly',
    title: '🔥 Fajr Streak Master',
    description: 'Pray Fajr every day this week (7 days)',
    difficulty: 'medium',
    bonusPoints: 20,
    status: 'accepted',
    createdAt: new Date('2026-02-17T00:00:00'),
    expiresAt: new Date('2026-02-23T23:59:59'),
    acceptedAt: new Date('2026-02-17T06:00:00'),
    icon: '🔥',
    requirements: [{
      type: 'streak',
      target: 7,
      itemIds: ['item1'],
      description: 'Maintain 7-day Fajr streak'
    }],
    progress: {
      current: 3,
      target: 7,
      percentage: 43,
      isComplete: false
    }
  }
];