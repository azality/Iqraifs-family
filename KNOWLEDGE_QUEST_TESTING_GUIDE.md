# Knowledge Quest System - Testing Guide

## System Overview

The Knowledge Quest system is a dynamic quiz platform where kids can:
- Select difficulty levels (Easy/Medium/Hard) for each question with different point values (5/10/20)
- Use hints that reduce points
- Play through categories like Islamic knowledge, math, and science
- Earn points that get added to their FGS point total

## Backend Status ✅

All 12 Knowledge Quest API endpoints are fully operational:

### Question Management
1. `POST /questions` - Create new question
2. `GET /questions` - Get all questions for family
3. `PUT /questions/:id` - Update question
4. `DELETE /questions/:id` - Delete question
5. `GET /question-categories` - Get category statistics

### Session Management
6. `POST /knowledge-sessions` - Start new session
7. `POST /knowledge-sessions/:sessionId/answer` - Submit answer
8. `POST /knowledge-sessions/:sessionId/complete` - Complete and award points
9. `GET /knowledge-sessions/:sessionId` - Get session details
10. `GET /children/:childId/knowledge-sessions` - Get all child sessions

### Question Pool
11. `GET /knowledge-sessions/:sessionId/next-question` - Get next question for session
12. `POST /knowledge-sessions/:sessionId/skip` - Skip current question

## Critical Fix Applied ✅

The `getUserFamilyId()` helper function has been correctly implemented in `/supabase/functions/server/middleware.tsx`. This function:
- Looks up the user's family ID from their family membership
- Is used instead of trying to extract familyId from route params when not available
- Fixes the "getFamilyId(c)" errors that were occurring

## Frontend Components ✅

### Kid Mode (3 pages):
1. **KnowledgeQuest.tsx** - Quest selection page with category filters
2. **KnowledgeQuestPlay.tsx** - Gameplay interface with difficulty selection
3. **KnowledgeQuestResults.tsx** - Results screen with stats

### Parent Mode (2 pages):
1. **QuestionBank.tsx** - Browse/add/edit/delete questions
2. **QuestionForm.tsx** - Question editor form

### Quick Access
- Knowledge Quest button added to Kid Dashboard (Brain icon, indigo/purple gradient)

## Seed Data 📚

**150+ questions** available across:
- Islamic Knowledge (50 questions)
- Math (50 questions)  
- Science (50+ questions)

Each question includes:
- Multiple difficulties (Easy/Medium/Hard)
- Hints with point penalties
- Explanations and sources
- Tags for categorization

## Testing Steps

### Step 1: Import Seed Questions (Parent Mode)

1. Log in as a parent
2. Navigate to **Parent Dashboard** → **Question Bank** 
3. Click **"Import 150+ Starter Questions"** button
4. Wait for import to complete (should show success count)
5. Verify questions appear in the question bank

### Step 2: Start a Knowledge Quest (Kid Mode)

1. Log in as a kid (or switch to Kid Mode)
2. On **Kid Dashboard**, click the new **"Knowledge Quest"** button (Brain icon, purple gradient)
3. You should see:
   - Category selection cards (Islamic, Math, Science)
   - Each category shows question counts by difficulty (🟢 Easy, 🟡 Medium, 🔴 Hard)
   - Recent quest history (if any)
   - Stats showing total points, quests completed, questions answered

### Step 3: Play a Quest

1. Select one or more categories (or leave empty for all topics)
2. Click **"🚀 Start Knowledge Quest! 🌟"**
3. System creates a new session and navigates to gameplay

**Gameplay Features:**
- Question displays with 4 multiple choice options
- **Difficulty selector** before answering:
  - 🟢 Easy (5 points)
  - 🟡 Medium (10 points)  
  - 🔴 Hard (20 points)
- **Hint button** (reduces points by penalty amount)
- Answer buttons that show correct/incorrect feedback
- Progress tracking (questions answered, correct count, points earned)

### Step 4: Complete and Review

1. Answer 5-10 questions (configurable)
2. Click **"Finish Quest"** or wait for auto-completion
3. **Results page** shows:
   - Total points earned (automatically added to child's point balance)
   - Accuracy percentage
   - Breakdown by difficulty (Easy/Medium/Hard attempted and correct)
   - Hints used count
   - Detailed question review with explanations

### Step 5: Verify Points Awarded

1. Return to Kid Dashboard
2. Check that points have been added to child's total
3. Verify in Recent Activity that Knowledge Quest points appear

## Parent Features

### Question Management

**Browse Questions:**
- Filter by category, difficulty, or search
- View question stats (times asked, correct rate)
- Edit or delete existing questions

**Add Custom Questions:**
- Click **"+ Add Question"**
- Fill in question details:
  - Category, difficulty, question text
  - 4 multiple choice options
  - Correct answer index
  - Hint text and reduced options
  - Base points and hint penalty
  - Explanation, source, tags

**Bulk Import:**
- Use CSV import feature for large question sets
- Template available in UI

### Analytics

View knowledge quest stats:
- Categories most practiced
- Difficulty distribution
- Question performance metrics
- Child progress over time

## API Testing

### Test Question Categories Endpoint

```bash
curl -X GET \
  'https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-f116e23f/question-categories' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

Expected response:
```json
[
  {
    "name": "islamic",
    "total": 50,
    "easy": 20,
    "medium": 20,
    "hard": 10
  },
  ...
]
```

### Test Session Creation

```bash
curl -X POST \
  'https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-f116e23f/knowledge-sessions' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "childId": "child:xxx",
    "familyId": "family:xxx"
  }'
```

Expected response:
```json
{
  "id": "session:xxx",
  "childId": "child:xxx",
  "familyId": "family:xxx",
  "status": "active",
  "questionsAnswered": 0,
  "correctAnswers": 0,
  "totalPointsEarned": 0,
  ...
}
```

## Known Limitations

1. **Question Pool**: Questions are filtered by family (family-specific + public questions)
2. **Session Duration**: No time limit enforced (can be added if needed)
3. **Question Repetition**: Same question can appear multiple times in different sessions
4. **Offline Support**: Requires active internet connection

## Troubleshooting

### "Failed to load knowledge quest data"
- Check that child is selected in FamilyContext
- Verify accessToken is present
- Check browser console for specific error

### "No questions available"
- Import seed questions via Question Bank
- Or create custom questions as a parent

### "Failed to create session"  
- Verify child has valid familyId
- Check that user has proper authentication
- Review server logs for detailed error

### Points not awarded after completion
- Verify session was marked as "completed" (not "abandoned")
- Check that `totalPointsEarned > 0` in session
- Review child's point events in Audit Trail

## Next Steps for Enhancement

### Potential Features:
1. **Leaderboards** - Family-wide or category-specific rankings
2. **Achievements** - Badges for milestones (50 questions answered, 10 in a row correct, etc.)
3. **Adaptive Difficulty** - Auto-adjust based on performance
4. **Timed Mode** - Speed challenges with bonus points
5. **Multiplayer** - Compete against siblings
6. **Question Reports** - Flag incorrect or unclear questions
7. **Study Mode** - Review explanations without points
8. **Daily Challenges** - Featured categories or themes

## Summary

The Knowledge Quest system is **fully operational and ready for testing**. All backend endpoints are working, the frontend is complete with beautiful kid-friendly UI, and 150+ seed questions are available for immediate use. The critical `getUserFamilyId()` fix ensures that family context is properly resolved across all endpoints.

**Status: ✅ READY FOR PRODUCTION TESTING**

---

Last Updated: March 6, 2026
Version: 1.0.0
