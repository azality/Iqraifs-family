# 🕌 Journey Through Quranic Lands - Game Design Spec

**Version:** 1.0  
**Date:** February 19, 2026  
**Target Audience:** Children ages 6-12 in Quran classes  
**Platform:** Web-based (FGS integration)

---

## 🎯 EXECUTIVE SUMMARY

**Journey Through Quranic Lands** is an interactive, story-based Islamic learning game where real-world Quran class progress (stickers) becomes in-game currency. Children explore Quranic stories through levels, complete learning activities, build mosques, and earn rewards while reinforcing what they learn in class.

### Core Innovation

**Real-World → Virtual Loop:**
- Attend Quran class → Earn stickers for attendance/progress
- Convert stickers to in-game points (1 sticker = 10 points)
- Spend points to unlock levels, buy tools, customize upgrades
- Play learning activities that reinforce class lessons
- Progress through Quranic story levels
- Earn leaderboard recognition and rewards

### Integration with FGS

This game **extends** the existing Family Growth System:
- Uses existing **points economy**
- Leverages existing **attendance tracking** (stickers = attendance records)
- Builds on existing **challenges system**
- Extends existing **quiz system** with story-based learning
- Enhances existing **mosque building** feature
- Adds **narrative progression** layer

---

## 🎮 CORE GAME LOOP

```
┌─────────────────────────────────────────────────────────┐
│                    REAL WORLD                           │
│  Attend Quran Class → Teacher gives sticker/stamp       │
│  Parent logs attendance in FGS → Points awarded         │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│                   IN-GAME ECONOMY                       │
│  Sticker Points (10 per sticker) → Spendable Currency   │
│  Use points to: Unlock levels, Buy tools, Customize     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│                LEARNING ACTIVITIES                      │
│  - Match Ayahs to Translations                          │
│  - Recite to Unlock Paths (voice-based, AI later)       │
│  - Build Mosques (visual progress)                      │
│  - Mini-Games (word search, puzzles)                    │
│  - Sadqa Giving (donate points to causes)               │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│                  LEVEL PROGRESSION                      │
│  Each level = Quranic story/lesson                      │
│  Complete activities → Unlock next level                │
│  Earn XP, titles, badges, leaderboard points            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│                REWARDS & RECOGNITION                    │
│  - Leaderboard rankings (class/family)                  │
│  - Special titles (Quran Explorer, Story Seeker)        │
│  - Virtual rewards (backgrounds, avatars)               │
│  - Real rewards (convert to FGS rewards)                │
└─────────────────────────────────────────────────────────┘
```

---

## 🗺️ GAME WORLD STRUCTURE

### World Map (Level Selection)

**Journey Path:** Linear progression through Islamic history and Quranic stories

**Level Themes:**
1. **Creation** - Story of Adam (AS)
2. **The Ark** - Story of Nuh (AS)
3. **The Fire** - Story of Ibrahim (AS)
4. **The Palace** - Story of Yusuf (AS)
5. **The Sea** - Story of Musa (AS)
6. **The Ant** - Story of Sulaiman (AS)
7. **The Cave** - Story of Ashab al-Kahf
8. **The Spider** - Story of Prophet Muhammad (SAW) in the cave
9. **The Elephant** - Year of the Elephant
10. **The Light** - Revelation and spreading of Islam

**Progression:**
- Levels unlock sequentially
- Each level costs points to unlock (increasing cost)
- Levels 1-3: Free (tutorial)
- Levels 4-6: 50 points each
- Levels 7-9: 100 points each
- Level 10: 200 points (grand finale)

---

## 🎯 LEARNING ACTIVITIES (Mini-Games)

### 1. **Ayah Matching** (No AI Required)
**Description:** Match Arabic ayahs to their English translations

**Gameplay:**
- Present 4-6 ayahs from the current story
- Show translations in random order
- Drag & drop to match
- Immediate feedback (correct/incorrect)
- Hints available (costs 5 points)

**Difficulty Levels:**
- Easy: 3 ayahs, clear language
- Medium: 5 ayahs, similar translations
- Hard: 6 ayahs, nuanced differences

**Rewards:**
- Correct match: +10 XP
- Perfect round (all correct): +25 XP bonus
- Unlock next story segment

### 2. **Recitation Paths** (AI Required - Future)
**Description:** Recite memorized surahs to light up the path forward

**MVP (No AI):**
- Present a button "I can recite [Surah Name]"
- Kid clicks button
- Parent/teacher verifies separately (honor system)
- Path unlocks on verification

**Future (With AI):**
- Voice recording
- AI checks pronunciation, tajweed basics
- Gentle feedback ("Great start! Try the 'q' sound stronger")
- Teacher/parent can override AI decision
- Lenient vs. strict mode settings

### 3. **Story Comprehension Quiz** (No AI Required)
**Description:** Answer questions about the Quranic story

**Gameplay:**
- Multiple choice questions
- 5 questions per level
- Based on story narration
- Rewards for correct answers

**Example (Story of Nuh):**
- Q: How long did Nuh (AS) call his people to Allah?
  - A) 10 years
  - B) 100 years
  - C) 950 years ✓
  - D) 50 years

### 4. **Word Search** (No AI Required)
**Description:** Find Islamic/Arabic words in a grid

**Gameplay:**
- Grid contains words from the story
- Find: Names (Ibrahim, Ismail), concepts (Sabr, Tawakkul)
- Timed or untimed mode
- Helps with Arabic word recognition

### 5. **Mosque Building** (No AI Required - Already Exists!)
**Description:** Spend points to build mosque pieces

**Integration:**
- Use existing MosqueBuild component
- Each story level completion adds a piece
- Visual progress from foundation → dome → minaret
- Final mosque at level 10 completion

### 6. **Sadqa Giving** (No AI Required - Already Exists!)
**Description:** Donate points to virtual charity causes

**Integration:**
- Use existing SadqaGiving component
- Causes themed to stories:
  - Feed hungry (like Yusuf's stored grain)
  - Plant trees (like Ibrahim's legacy)
  - Build wells (like Musa's water miracle)

---

## 💎 IN-GAME ECONOMY

### Currency Types

**1. Sticker Points (Primary Currency)**
- Earned from real-world Quran class attendance
- 1 sticker = 10 sticker points
- Used to unlock levels, buy tools
- Cannot be earned in-game (preserves real-world value)

**2. XP (Experience Points)**
- Earned from completing activities in-game
- Used for leveling up
- Earns titles and badges
- Does NOT unlock levels (only sticker points do)

**3. Hint Scrolls (Tool Currency)**
- Bought with sticker points (5 points = 1 scroll)
- Used during activities for hints
- Limited per level (max 3 scrolls)

### Point Economy Balance

**Earning Rates (Real World):**
- Attend class: +1 sticker (10 points)
- Memorize new surah: +2 stickers (20 points)
- Perfect recitation: +1 bonus sticker (10 points)
- Weekly attendance (5 days): +1 bonus sticker (10 points)

**Spending Costs (In-Game):**
- Unlock Level 4-6: 50 points each
- Unlock Level 7-9: 100 points each
- Unlock Level 10: 200 points
- Buy Hint Scroll: 5 points
- Customize Avatar: 20 points
- Unlock Background: 30 points
- Mosque Upgrade: 50 points

**Time to Progress:**
- 5 classes → 50 points → Unlock 1 mid-level
- 10 classes → 100 points → Unlock 1 advanced level
- 20 classes → 200 points → Unlock finale level

**Design Goal:** Encourage consistent attendance (1-2 months to complete journey)

---

## 🤖 AI INTEGRATION POINTS (Future Phase)

### 1. **Voice-Based Recitation Checking** (High Impact)

**Technology:**
- Speech-to-text (Arabic)
- Tajweed rule detection (basic)
- Phoneme matching

**Features:**
- Kid recites into microphone
- AI detects attempt, gives gentle feedback
- Teacher/parent can override AI decision
- Settings: Strict vs. Lenient scoring

**Kid-Safe Constraints:**
- No permanent "failed" status
- Always option to retry unlimited times
- Feedback is encouraging ("Keep practicing!")
- Parent/teacher final authority

**Cost Estimate:**
- ~$0.01 per recitation check (Google Cloud Speech API)
- 100 recitations/month = $1
- Acceptable for home/class use

### 2. **Adaptive Difficulty** (Medium Impact)

**Triggers:**
- Student struggles with ayah matching (2+ wrong attempts)
- Quiz score <50%
- Repeat failures on same activity

**Adaptations:**
- Reduce choices (6 ayahs → 4 ayahs)
- Add visual hints (first letter of translation)
- Switch to easier story segment
- Offer "practice mode" (no points at stake)

**Implementation:**
- Simple rule-based AI (no ML needed for MVP)
- Track attempt history
- Adjust parameters dynamically

### 3. **Personalized "Quran Scroll" Hints** (Low Impact - Nice to Have)

**Instead of Static Hint:**
```
Static: "This ayah talks about patience"
```

**AI-Generated Hint:**
```
Dynamic: "Think about what Nuh (AS) had to do for 950 years. 
What quality did he show?" (Answer: Sabr/patience)
```

**Technology:**
- GPT-4-mini or similar
- Constrained prompts (approved content only)
- ~$0.001 per hint

### 4. **Dynamic Story Narration** (Medium Impact)

**Concept:**
- NPC characters tell story at each level
- Dialogue adapts to level (Makkah vs Madinah)
- Age-appropriate language

**MVP (No AI):**
- Static pre-written story text
- Same for all kids

**Future (With AI):**
- Narration adjusts to reading level
- Can ask follow-up questions
- Still fully constrained to approved Islamic content

**Safety:**
- All AI-generated text reviewed by parent/teacher first
- Option to use only static approved content
- Islamic scholar review for content accuracy

### 5. **Teacher Tools** (High Value for Scaling)

**Auto-Generate Challenges:**
```
Input: Week 5, Story of Ibrahim, Class learned Surah Al-Ikhlas
Output: 
  Challenge: "Recite Surah Al-Ikhlas 5 times this week"
  Bonus: "Teach Surah Al-Ikhlas to a family member"
  Reward: +20 bonus points
```

**Weekly Progress Summaries:**
```
Auto-generated report:
"Ahmed completed 3 levels this week (Stories of Nuh, Ibrahim, Yusuf).
He excels at ayah matching (95% accuracy) but needs practice with
recitation (2 attempts on Al-Fatiha). Suggested focus: Tajweed basics."
```

**Recognition Titles:**
```
AI suggests:
- Ahmed → "Story Master" (completed 5 levels)
- Fatima → "Quran Explorer" (tried all activities)
- Omar → "Steadfast Learner" (10-day streak)
```

---

## 🏆 LEADERBOARD & RECOGNITION

### Leaderboard Types

**1. Class Leaderboard**
- Ranks all students in the same Quran class
- Based on XP earned (not sticker points - keeps it fair)
- Resets weekly
- Top 3 get special badges

**2. Family Leaderboard**
- Ranks siblings in the same family
- Encourages friendly competition
- Parents can see relative progress

**3. All-Time Leaderboard**
- Cumulative XP across all levels
- Prestige titles for top performers
- Never resets (long-term motivation)

### Recognition System

**Titles (Earned at Milestones):**
- Level 1 Complete: "First Steps"
- Level 3 Complete: "Story Seeker"
- Level 5 Complete: "Quran Explorer"
- Level 7 Complete: "Knowledge Bearer"
- Level 10 Complete: "Master of the Journey"

**Badges (Earned for Achievements):**
- 🌟 Perfect Week (5 stickers in 1 week)
- 📿 Memorization Master (10 surahs recited)
- 🕌 Mosque Builder (Complete mosque)
- 💝 Generous Heart (Donated 50+ points to sadqa)
- 🏆 Top 3 Finisher (Leaderboard placement)

**Streak Bonuses:**
- 5-day streak: +10 bonus XP
- 10-day streak: +25 bonus XP
- 30-day streak: +100 bonus XP + special title

---

## 📱 USER INTERFACE (Kid Mode)

### Main Game Screen

```
┌─────────────────────────────────────────────────┐
│  🌟 Journey Through Quranic Lands 🌟           │
│                                                 │
│  [Your Profile]                                 │
│  Name: Ahmed                                    │
│  Level: 3 (Story of Ibrahim)                    │
│  XP: 250 / 300 to next title                    │
│  Sticker Points: 80                             │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │      🗺️ World Map                        │   │
│  │                                          │   │
│  │  [✓] Level 1: Creation (Completed)      │   │
│  │  [✓] Level 2: The Ark (Completed)       │   │
│  │  [▶] Level 3: The Fire (In Progress)    │   │
│  │  [🔒] Level 4: The Palace (50 pts)      │   │
│  │  [🔒] Level 5: The Sea (50 pts)         │   │
│  │  [🔒] ...more levels locked...          │   │
│  │                                          │   │
│  │  [Current Quest]                         │   │
│  │  Complete 5 Ayah Matches in Level 3      │   │
│  │  Progress: ███░░ 3/5                     │   │
│  │                                          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Quick Actions:                                 │
│  [📖 Continue Story] [🎯 Activities]            │
│  [🏆 Leaderboard] [🕌 My Mosque]                │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Level Screen (Story View)

```
┌─────────────────────────────────────────────────┐
│  ← Back to Map                                  │
│                                                 │
│  🔥 Level 3: The Fire (Story of Ibrahim)       │
│                                                 │
│  [Story Narration]                              │
│  ┌────────────────────────────────────────┐    │
│  │ 📜                                      │    │
│  │ Prophet Ibrahim (AS) was tested by     │    │
│  │ his people when they threw him into    │    │
│  │ a great fire. But Allah commanded      │    │
│  │ the fire: "O fire, be coolness and     │    │
│  │ safety for Ibrahim!"                   │    │
│  │                                         │    │
│  │ [🎧 Listen to Story] [📖 Read More]    │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  Activities in This Level:                      │
│  ┌───────────────────────────────────────┐     │
│  │ ✅ Story Quiz (Completed)              │     │
│  │ ▶️ Ayah Matching (3/5 done)            │     │
│  │ 🔒 Recitation Challenge (unlock: 10pts)│     │
│  │ 🔒 Build Ibrahim's Masjid (unlock: 20) │     │
│  └───────────────────────────────────────┘     │
│                                                 │
│  Rewards for Completing Level:                  │
│  +50 XP, +1 Badge, Unlock Level 4               │
│                                                 │
│  [Play Activity] [Buy Hint Scroll: 5pts]        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🎓 TEACHER/PARENT DASHBOARD

### Class Management View (Parent Mode Extension)

```
┌─────────────────────────────────────────────────┐
│  Quran Class Dashboard                          │
│                                                 │
│  Class: Sunday Morning (Ages 8-10)              │
│  Students: 12                                   │
│                                                 │
│  This Week's Progress:                          │
│  ┌────────────────────────────────────────┐    │
│  │ Total Stickers Given: 48                │    │
│  │ Avg Level: 3.2 (Story of Ibrahim)       │    │
│  │ Completion Rate: 75%                     │    │
│  │                                          │    │
│  │ Top Performers:                          │    │
│  │ 🥇 Ahmed (250 XP, Level 5)              │    │
│  │ 🥈 Fatima (220 XP, Level 4)             │    │
│  │ 🥉 Omar (210 XP, Level 4)               │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  Quick Actions:                                 │
│  [Give Stickers] [Create Challenge]             │
│  [View Individual Progress] [Export Report]     │
│                                                 │
│  AI-Suggested Challenges (Future):              │
│  ┌────────────────────────────────────────┐    │
│  │ "Class learned Surah Al-Asr today.      │    │
│  │  Suggested challenge:                   │    │
│  │  'Recite Al-Asr 5 times this week'      │    │
│  │  Reward: +20 bonus points"              │    │
│  │                                          │    │
│  │  [Create Challenge] [Edit] [Dismiss]    │    │
│  └────────────────────────────────────────┘    │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🛠️ TECHNICAL INTEGRATION WITH FGS

### Database Extensions (KV Store)

**New Entities:**

```typescript
// Game Level Progress
interface LevelProgress {
  id: string;
  childId: string;
  levelNumber: number; // 1-10
  status: 'locked' | 'unlocked' | 'in-progress' | 'completed';
  activitiesCompleted: string[]; // activity IDs
  xpEarned: number;
  completedAt?: string;
}

// Game Activity Attempt
interface ActivityAttempt {
  id: string;
  childId: string;
  levelNumber: number;
  activityType: 'ayah-match' | 'quiz' | 'recitation' | 'word-search';
  score: number; // 0-100
  timeSpent: number; // seconds
  hintsUsed: number;
  completedAt: string;
}

// Sticker Conversion
interface StickerConversion {
  id: string;
  childId: string;
  attendanceRecordId: string;
  stickersEarned: number; // usually 1
  pointsConverted: number; // stickers * 10
  convertedAt: string;
}

// Leaderboard Entry
interface LeaderboardEntry {
  id: string;
  childId: string;
  classId?: string; // if multi-class
  totalXP: number;
  currentLevel: number;
  rank: number;
  weeklyXP: number;
  lastUpdated: string;
}
```

### API Endpoints (Extend Existing Server)

**Game Progress:**
```
POST /game/levels/:levelId/unlock
GET /game/children/:childId/progress
POST /game/levels/:levelId/complete
GET /game/levels/:levelId/activities
```

**Activities:**
```
POST /game/activities/:activityId/start
POST /game/activities/:activityId/submit
GET /game/children/:childId/activity-history
```

**Stickers:**
```
POST /game/stickers/convert (attendance → sticker points)
GET /game/children/:childId/sticker-balance
```

**Leaderboard:**
```
GET /game/leaderboard/class/:classId
GET /game/leaderboard/family/:familyId
GET /game/leaderboard/all-time
```

### Frontend Components

**New Pages:**
- `/game` - Main game hub (world map)
- `/game/level/:id` - Level detail view
- `/game/activity/:id` - Activity play screen
- `/game/leaderboard` - Leaderboard view
- `/game/teacher` - Teacher dashboard (parent mode)

**New Components:**
- `WorldMap.tsx` - Interactive level map
- `StoryNarration.tsx` - Story display with audio
- `AyahMatchGame.tsx` - Ayah matching activity
- `QuranQuiz.tsx` - Story comprehension quiz
- `RecitationPath.tsx` - Recitation unlock screen
- `LeaderboardTable.tsx` - Rankings display
- `StickerBalance.tsx` - Sticker points display

### State Management

**Extend FamilyContext:**
```typescript
interface FamilyContextExtensions {
  // Game state
  currentLevel: number;
  stickerPoints: number;
  totalXP: number;
  unlockedLevels: number[];
  
  // Game actions
  unlockLevel: (levelId: number) => Promise<void>;
  completeActivity: (activityId: string, score: number) => Promise<void>;
  convertStickers: (attendanceId: string) => Promise<void>;
  getLeaderboard: (type: 'class' | 'family' | 'all') => Promise<LeaderboardEntry[]>;
}
```

---

## 📅 PHASED IMPLEMENTATION PLAN

### **PHASE 0: Planning & Design** (1 week)
- [ ] Finalize story content for all 10 levels
- [ ] Create story narration scripts (text)
- [ ] Design ayah matching questions
- [ ] Design quiz questions
- [ ] Create visual assets (level backgrounds, characters)
- [ ] Islamic scholar review of all content

### **PHASE 1: MVP (No AI)** (2-3 weeks)

**Goal:** Playable game with static content, manual verification

**Deliverables:**

**1.1 Backend:**
- [ ] Database models (LevelProgress, ActivityAttempt, etc.)
- [ ] API endpoints (unlock, complete, leaderboard)
- [ ] Sticker conversion logic
- [ ] XP calculation system

**1.2 Frontend:**
- [ ] World Map page (level selection)
- [ ] Level detail page (story + activities)
- [ ] Ayah Matching game (drag & drop)
- [ ] Story Quiz game (multiple choice)
- [ ] Word Search game (basic grid)
- [ ] Leaderboard page

**1.3 Integration:**
- [ ] Link attendance to sticker conversion
- [ ] Mosque building tied to level completion
- [ ] Sadqa giving integrated into levels

**1.4 Parent/Teacher Tools:**
- [ ] Manual sticker awarding interface
- [ ] Progress tracking dashboard
- [ ] Simple challenge creation

**What's EXCLUDED from MVP:**
- ❌ Voice recitation (AI required)
- ❌ Adaptive difficulty (AI required)
- ❌ Dynamic hints (AI required)
- ❌ Auto-generated challenges (AI required)

**What's INCLUDED (Manual Workarounds):**
- ✅ Recitation unlock: Kid clicks "I can recite", parent verifies
- ✅ Hints: Static pre-written hints (not personalized)
- ✅ Challenges: Teacher manually creates challenges
- ✅ Story narration: Static text (can add audio recordings later)

### **PHASE 2: Content Expansion** (1-2 weeks)

**Goal:** Complete all 10 levels with full content

**Deliverables:**
- [ ] All 10 levels with stories
- [ ] 50+ ayah matching questions
- [ ] 50+ quiz questions
- [ ] 10+ word search puzzles
- [ ] Professional audio narration (recorded, not AI)
- [ ] Visual polish (backgrounds, animations)

### **PHASE 3: AI Integration** (2-3 weeks)

**Goal:** Add AI features to enhance experience

**Deliverables:**

**3.1 Voice Recitation:**
- [ ] Integrate speech-to-text API
- [ ] Build recitation verification UI
- [ ] Add lenient/strict settings
- [ ] Parent override functionality

**3.2 Adaptive Difficulty:**
- [ ] Track attempt history
- [ ] Implement rule-based adjustments
- [ ] Add practice mode

**3.3 Personalized Hints:**
- [ ] Integrate GPT-4-mini for hints
- [ ] Create constrained prompts
- [ ] Add hint preview/approval for parents

**3.4 Teacher AI Tools:**
- [ ] Auto-generate weekly challenges
- [ ] Generate progress summaries
- [ ] Suggest recognition titles

### **PHASE 4: Scaling & Polish** (Ongoing)

**Goal:** Support multiple classes, advanced features

**Deliverables:**
- [ ] Multi-class support (teacher can manage multiple classes)
- [ ] Advanced leaderboards (filters, time ranges)
- [ ] Achievements system expansion
- [ ] Seasonal events (Ramadan special levels)
- [ ] Parent analytics dashboard
- [ ] Migrate to Postgres (if >10 classes)

---

## 💰 COST ESTIMATES

### MVP (Phase 1 - No AI)

**Development:** 
- Assumes you're building it yourself (free)
- Or contractor: ~$3,000-5,000 USD

**Hosting (Supabase):**
- Free tier: 500MB database, 50,000 API calls/month
- Cost: $0/month for home use

**Content Creation:**
- Story writing: DIY (free) or writer ($500)
- Audio narration: DIY recordings (free) or voice actor ($300)
- Visual assets: Canva/DIY (free) or designer ($500)

**Total MVP: $0-$6,300**

### AI Integration (Phase 3)

**Voice Recitation (Google Cloud Speech API):**
- $0.01 per minute of audio
- 10 kids × 5 recitations/week × 4 weeks = 200 recitations/month
- Average recitation: 30 seconds = 0.5 minutes
- Cost: 200 × 0.5 × $0.01 = **$1/month**

**Personalized Hints (GPT-4-mini):**
- $0.001 per hint
- 10 kids × 10 hints/week × 4 weeks = 400 hints/month
- Cost: 400 × $0.001 = **$0.40/month**

**Teacher Tools (GPT-4-mini):**
- Weekly challenge generation: 4 × $0.01 = $0.04/month
- Progress summaries: 10 × $0.02 = $0.20/month
- Cost: **$0.24/month**

**Total AI Costs: ~$2/month for 10 students**

### Scaling (Per 100 Students)

**Voice Recitation:** $10/month  
**Hints:** $4/month  
**Teacher Tools:** $2/month  
**Hosting (Supabase Pro):** $25/month  

**Total: ~$41/month for 100 students**

---

## 🛡️ SAFETY & ISLAMIC COMPLIANCE

### Content Safety

**Islamic Scholar Review:**
- All Quranic stories reviewed for accuracy
- Translations verified against approved sources
- Age-appropriate language verified
- No controversial interpretations

**AI Content Constraints:**
- All AI-generated text constrained to approved Islamic content
- No free-form "chat" with AI
- Parent/teacher can review before showing to kids
- Option to disable AI entirely (use static content only)

### Kid Safety

**Voice Recitation:**
- Audio NOT stored permanently (deleted after verification)
- No sharing of recordings
- Parent can disable voice feature

**Leaderboard:**
- Display names only (no photos, personal info)
- Option for private mode (hide from leaderboard)
- Class-only visibility (not public)

**Data Privacy:**
- COPPA compliant (parental consent required)
- No ads, no tracking
- Data exportable/deletable

---

## 📊 SUCCESS METRICS

### For Kids (Engagement)
- % of students who complete Level 1
- Average levels completed per student
- Daily active users
- Time spent in-game per week
- Activity completion rates

### For Teachers (Learning Outcomes)
- Correlation: stickers earned vs. levels completed
- Improvement in recitation accuracy (pre/post)
- Improvement in ayah recognition (quiz scores)
- Attendance improvement (before/after game)

### For Parents (Satisfaction)
- Parent survey: "Has the game helped your child learn?"
- Parent survey: "Would you recommend this game?"
- Retention rate (% still using after 3 months)

---

## 🎯 MVP ACCEPTANCE CRITERIA

**The game is ready for home testing when:**

✅ All 3 levels playable (Stories of Adam, Nuh, Ibrahim)  
✅ Sticker conversion works (attendance → points)  
✅ Ayah matching activity functional  
✅ Story quiz functional  
✅ World map shows progress  
✅ Leaderboard displays correctly  
✅ Mosque building tied to level completion  
✅ Parent can manually award stickers  
✅ Kid can see XP and unlock levels  
✅ No critical bugs in core loop  

**Nice-to-haves for MVP (not blockers):**
- Audio narration (can use text-only initially)
- Word search game
- Hint scrolls
- All 10 levels (can start with 3)

---

## 🚀 CONCLUSION

**Journey Through Quranic Lands** is a complete Islamic learning game that:

✅ **Motivates** kids through real-world → virtual loop  
✅ **Reinforces** Quran class lessons through play  
✅ **Tracks** progress transparently for parents/teachers  
✅ **Scales** from home use to full Quran school deployment  
✅ **Integrates** seamlessly with existing FGS infrastructure  

**MVP Scope (No AI):** Fully functional game with static content, manual verification  
**Future Vision (With AI):** Enhanced with voice, adaptive difficulty, personalized hints  

**Ready to build in phases:**
- Phase 1: MVP (home testing, free)
- Phase 2: Content expansion (all 10 levels)
- Phase 3: AI features (~$2/month for 10 students)
- Phase 4: Scale to Quran schools (100+ students)

**Next Step:** Approve this spec and start Phase 0 (content creation + design) while testing MVP of existing FGS features at home.

---

**Prepared by:** AI System Engineer  
**Date:** February 19, 2026  
**Status:** ✅ **READY FOR REVIEW & APPROVAL**
