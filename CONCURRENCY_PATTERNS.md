# Concurrency Patterns - Quick Reference Guide

## Core Principle: Claim-First, Not Check-First

**❌ WRONG (Check-Then-Act Race Condition)**:
```typescript
const existing = await kv.get(key);
if (existing) return existing;
await kv.set(key, value);  // ← Race window here!
```

**✅ CORRECT (Atomic Claim-First)**:
```typescript
const claimed = await kv.setIfAbsent(key, value);
if (!claimed) {
  const existing = await kv.get(key);
  return existing;
}
// We won the claim - proceed
```

---

## Pattern Library

### Pattern 1: Idempotency (Prevent Duplicate Operations)

**Use Case**: API endpoints that must execute exactly once per request ID

```typescript
async function createEventIdempotent(eventData, idempotencyKey) {
  const claimKey = `eventclaim:${idempotencyKey}`;
  const eventId = generateEventId();
  
  // Try to claim this operation
  const claimed = await kv.setIfAbsent(claimKey, {
    eventId,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  });
  
  if (!claimed) {
    // Operation already in progress or complete
    const existingClaim = await kv.get(claimKey);
    const existingEvent = await kv.get(existingClaim.eventId);
    return existingEvent;
  }
  
  // We claimed it - do the work
  const event = { id: eventId, ...eventData };
  await kv.set(eventId, event);
  
  // Mark claim as complete
  await kv.set(claimKey, {
    eventId,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });
  
  return event;
}
```

**Key Points**:
- Generate ID early (before claim)
- Claim BEFORE creating resource
- Update claim status after creation (PENDING → ACTIVE)
- Return existing result if claim fails

---

### Pattern 2: Singleton Enforcement (One Operation Per Scope)

**Use Case**: Business rules like "one prayer log per child per day"

```typescript
async function logSingletonEvent(childId, itemId, eventData) {
  const today = new Date().toISOString().split('T')[0];
  const singletonKey = `singleton:${childId}:${itemId}:${today}`;
  const eventId = generateEventId();
  
  // Try to acquire singleton lock
  const locked = await kv.setIfAbsent(singletonKey, {
    eventId,
    performedBy: eventData.loggedBy,
    timestamp: new Date().toISOString(),
    status: 'PENDING'
  });
  
  if (!locked) {
    // Singleton already logged by someone else
    const existingLock = await kv.get(singletonKey);
    const existingEvent = await kv.get(existingLock.eventId);
    
    throw new Error('SINGLETON_CONFLICT', {
      eventId: existingLock.eventId,
      loggedBy: existingLock.performedBy,
      timestamp: existingLock.timestamp
    });
  }
  
  // We got the lock - create event
  const event = { id: eventId, ...eventData };
  await kv.set(eventId, event);
  
  // Finalize lock
  await kv.set(singletonKey, {
    eventId,
    performedBy: eventData.loggedBy,
    timestamp: event.timestamp,
    status: 'ACTIVE'
  });
  
  return event;
}
```

**Key Points**:
- Lock key encodes scope (child + item + date)
- Lock acquired BEFORE event creation
- Return conflict details if lock fails
- Update lock status after creation

---

### Pattern 3: Counter/Quota Enforcement (Atomic Check + Update)

**Use Case**: Daily point caps, rate limits, inventory limits

```typescript
async function awardPointsWithCap(childId, points) {
  const today = new Date().toISOString().split('T')[0];
  const capLockKey = `caplock:${childId}:${today}`;
  const eventId = generateEventId();
  
  // Try to acquire cap lock with retry
  let capLockAcquired = false;
  let retries = 0;
  const maxRetries = 5;
  
  while (!capLockAcquired && retries < maxRetries) {
    capLockAcquired = await kv.setIfAbsent(capLockKey, {
      holder: eventId,
      acquiredAt: new Date().toISOString()
    });
    
    if (!capLockAcquired) {
      // Check for stale lock
      const existingLock = await kv.get(capLockKey);
      const lockAge = Date.now() - new Date(existingLock.acquiredAt).getTime();
      
      if (lockAge > 3000) {
        // Stale lock - force release
        await kv.del(capLockKey);
      } else {
        // Wait and retry
        await sleep(50 + Math.random() * 50);
      }
    }
    retries++;
  }
  
  if (!capLockAcquired) {
    throw new Error('SYSTEM_BUSY', { message: 'Could not acquire cap lock' });
  }
  
  try {
    // Lock acquired - perform atomic check + update
    const child = await kv.get(childId);
    
    // Reset counter if new day
    if (child.lastResetDate !== today) {
      child.dailyPointsEarned = 0;
      child.lastResetDate = today;
    }
    
    const cap = child.dailyPointsCap || 50;
    const currentDaily = child.dailyPointsEarned || 0;
    
    if (currentDaily + points > cap) {
      throw new Error('CAP_EXCEEDED', {
        cap,
        current: currentDaily,
        requested: points
      });
    }
    
    // Update counter
    child.dailyPointsEarned = currentDaily + points;
    await kv.set(childId, child);
    
    // Create event after cap check passes
    const event = { id: eventId, childId, points };
    await kv.set(eventId, event);
    
    return event;
  } finally {
    // ALWAYS release lock
    await kv.del(capLockKey);
  }
}
```

**Key Points**:
- Retry logic for lock acquisition (with exponential backoff)
- Stale lock detection and cleanup (3-second threshold)
- try/finally ensures lock release
- Atomic check + update under lock

---

### Pattern 4: Compound Lock Acquisition (Multiple Locks)

**Use Case**: Operations requiring both idempotency AND singleton

```typescript
async function createEventWithMultipleLocks(eventData) {
  const { idempotencyKey, childId, trackableItemId } = eventData;
  const eventId = generateEventId();
  const acquiredLocks = [];
  
  try {
    // Lock 1: Idempotency claim
    if (idempotencyKey) {
      const claimKey = `eventclaim:${idempotencyKey}`;
      const claimed = await kv.setIfAbsent(claimKey, {
        eventId,
        status: 'PENDING'
      });
      
      if (!claimed) {
        const existing = await kv.get(claimKey);
        return await kv.get(existing.eventId);
      }
      
      acquiredLocks.push(claimKey);
    }
    
    // Lock 2: Singleton lock (if applicable)
    const item = await kv.get(trackableItemId);
    if (item?.isSingleton) {
      const today = new Date().toISOString().split('T')[0];
      const singletonKey = `singleton:${childId}:${trackableItemId}:${today}`;
      
      const locked = await kv.setIfAbsent(singletonKey, {
        eventId,
        status: 'PENDING'
      });
      
      if (!locked) {
        // Release idempotency claim and return conflict
        for (const lockKey of acquiredLocks) {
          await kv.del(lockKey);
        }
        throw new Error('SINGLETON_CONFLICT');
      }
      
      acquiredLocks.push(singletonKey);
    }
    
    // Lock 3: Cap lock (if points > 0)
    if (eventData.points > 0) {
      const capLockKey = await acquireCapLock(childId, eventId);
      acquiredLocks.push(capLockKey);
      
      // Perform cap check (atomic under lock)
      await checkAndUpdateDailyCap(childId, eventData.points);
    }
    
    // All locks acquired - create event
    const event = { id: eventId, ...eventData };
    await kv.set(eventId, event);
    
    // Finalize all locks (PENDING → ACTIVE)
    for (const lockKey of acquiredLocks) {
      const lockData = await kv.get(lockKey);
      await kv.set(lockKey, { ...lockData, status: 'ACTIVE' });
    }
    
    return event;
    
  } catch (error) {
    // Release all acquired locks on error
    for (const lockKey of acquiredLocks) {
      await kv.del(lockKey);
    }
    throw error;
  }
}
```

**Key Points**:
- Acquire locks in dependency order
- Track all acquired locks
- Release all locks on any error
- Finalize locks after success

---

### Pattern 5: Optimistic Concurrency (Last-Write-Wins)

**Use Case**: Non-critical updates where occasional overwrites are acceptable

```typescript
async function updateChildProfile(childId, updates) {
  const child = await kv.get(childId);
  const updated = { ...child, ...updates };
  await kv.set(childId, updated);
  return updated;
}
```

**When to Use**:
- Profile updates (name, avatar)
- Preference changes
- Non-financial data

**When NOT to Use**:
- Point balances
- Event logging
- Counter updates
- Quota enforcement

---

## Common Pitfalls

### ❌ Pitfall 1: Check-Then-Set
```typescript
// DON'T DO THIS
const exists = await kv.get(key);
if (!exists) {
  await kv.set(key, value);  // ← Race window!
}
```

### ❌ Pitfall 2: Forgetting Lock Cleanup
```typescript
// DON'T DO THIS
await kv.setIfAbsent(lockKey, { holder });
const data = await kv.get(dataKey);
return data;  // ← Lock never released!
```

### ❌ Pitfall 3: No Stale Lock Detection
```typescript
// DON'T DO THIS
while (!locked) {
  locked = await kv.setIfAbsent(lockKey, { holder });
  await sleep(100);  // ← Infinite loop if lock holder crashed!
}
```

### ❌ Pitfall 4: Releasing Wrong Lock
```typescript
// DON'T DO THIS
const locked = await kv.setIfAbsent(lockKey, { holder: eventId1 });
// ... later, different request ...
await kv.del(lockKey);  // ← Deleted someone else's lock!
```

---

## Best Practices

### ✅ Always Use try/finally for Locks
```typescript
let lockAcquired = false;
try {
  lockAcquired = await acquireLock();
  // ... do work ...
} finally {
  if (lockAcquired) await releaseLock();
}
```

### ✅ Include Timestamps in Lock Data
```typescript
await kv.setIfAbsent(lockKey, {
  holder: requestId,
  acquiredAt: new Date().toISOString(),  // ← For stale detection
  expiresAt: new Date(Date.now() + 5000).toISOString()
});
```

### ✅ Use Descriptive Lock Keys
```typescript
// Good
const lockKey = `caplock:${childId}:${YYYY-MM-DD}`;
const singletonKey = `singleton:${childId}:${itemId}:${YYYY-MM-DD}`;

// Bad
const lockKey = `lock:${id}`;
```

### ✅ Log Lock Contention
```typescript
if (!locked) {
  console.warn('Lock contention detected', {
    lockKey,
    requestId,
    retries
  });
}
```

---

## Performance Guidelines

### Lock Acquisition Timeouts

| Lock Type | Max Retries | Backoff | Total Timeout |
|-----------|-------------|---------|---------------|
| Idempotency | 0 | N/A | Immediate |
| Singleton | 0 | N/A | Immediate |
| Cap Lock | 5 | 50-100ms | ~500ms |
| Custom | 3-10 | 100-200ms | 1-2s |

### Stale Lock Thresholds

| Lock Type | Stale After | Auto-Release |
|-----------|-------------|--------------|
| Cap Lock | 3s | Yes |
| Singleton | No TTL | No (valid all day) |
| Idempotency | No TTL | No (valid forever) |

### Load Handling

**Low Load** (1-10 req/s):
- Near-zero contention
- No retries needed

**Medium Load** (10-100 req/s):
- Occasional retries (1-2)
- <1% timeout rate

**High Load** (100+ req/s):
- Frequent retries (2-5)
- 1-5% timeout rate
- Consider queuing or rate limiting

---

## Debugging Checklist

When investigating concurrency issues:

- [ ] Check for orphan resources (events without claims)
- [ ] Look for stale locks (timestamps >3s old)
- [ ] Verify lock key format matches expectations
- [ ] Confirm PENDING → ACTIVE transitions
- [ ] Check lock acquisition retry patterns in logs
- [ ] Verify cleanup on error paths
- [ ] Look for high timeout rates (>5%)
- [ ] Check for duplicate singletons (business rule violation)

---

## Quick Reference Card

```
PATTERN              WHEN TO USE                      LOCK TYPE
========================================================================
Idempotency          API calls that retry            Claim-first
Singleton            One action per scope            Lock-first  
Counter/Quota        Enforce limits atomically       Lock + retry
Compound Locks       Multiple constraints            Sequential acquisition
Optimistic           Non-critical updates            None (last-write-wins)
```

---

**Remember**: When in doubt, acquire the lock FIRST, then do the work.

**Document Version**: 1.0  
**Last Updated**: 2026-02-18
