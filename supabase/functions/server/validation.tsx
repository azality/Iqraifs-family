/**
 * Input Validation Middleware
 * 
 * Provides schema validation for all write endpoints to prevent:
 * - Extreme point values
 * - Unbounded strings
 * - Invalid dates
 * - Missing required fields
 * - Invalid enum values
 */

import { Context } from "npm:hono@4";

/**
 * Validation result type
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Point value constraints
 */
const POINT_CONSTRAINTS = {
  MIN: -1000,
  MAX: 1000,
};

/**
 * String length constraints
 */
const STRING_CONSTRAINTS = {
  NAME_MIN: 2,
  NAME_MAX: 50,
  NOTES_MAX: 500,
  REASON_MIN: 10,
  REASON_MAX: 500,
  EMAIL_MAX: 255,
  PIN_LENGTH: 4,
};

/**
 * Valid enum values
 */
const VALID_ENUMS = {
  CHILD_AVATAR: ["👦", "👧", "🧒", "🧑", "👶", "🦁", "🐯", "🦊", "🐻", "🐼"],
  EVENT_STATUS: ["active", "voided"],
  TRACKABLE_TYPE: ["habit", "behavior", "attendance"],
  CHALLENGE_STATUS: ["available", "accepted", "in_progress", "completed", "failed", "expired"],
  CHALLENGE_TYPE: ["daily", "weekly", "custom"],
  RECOVERY_TYPE: ["apology", "reflection", "correction"],
};

/**
 * Validate point event data
 */
export function validatePointEvent(data: any): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!data.childId) errors.push("childId is required");
  if (!data.trackableItemId) errors.push("trackableItemId is required");
  if (data.points === undefined || data.points === null) {
    errors.push("points is required");
  }
  if (!data.loggedBy) errors.push("loggedBy is required");

  // Point bounds
  if (typeof data.points === "number") {
    if (data.points < POINT_CONSTRAINTS.MIN || data.points > POINT_CONSTRAINTS.MAX) {
      errors.push(
        `points must be between ${POINT_CONSTRAINTS.MIN} and ${POINT_CONSTRAINTS.MAX}`
      );
    }
  } else {
    errors.push("points must be a number");
  }

  // String lengths
  if (data.notes && data.notes.length > STRING_CONSTRAINTS.NOTES_MAX) {
    errors.push(`notes must be ${STRING_CONSTRAINTS.NOTES_MAX} characters or less`);
  }

  // Boolean validation
  if (data.isAdjustment !== undefined && typeof data.isAdjustment !== "boolean") {
    errors.push("isAdjustment must be a boolean");
  }

  if (data.isRecovery !== undefined && typeof data.isRecovery !== "boolean") {
    errors.push("isRecovery must be a boolean");
  }

  if (data.isSadqa !== undefined && typeof data.isSadqa !== "boolean") {
    errors.push("isSadqa must be a boolean");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate void operation
 */
export function validateVoid(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.reason) {
    errors.push("reason is required");
  } else if (data.reason.length < STRING_CONSTRAINTS.REASON_MIN) {
    errors.push(`reason must be at least ${STRING_CONSTRAINTS.REASON_MIN} characters`);
  } else if (data.reason.length > STRING_CONSTRAINTS.REASON_MAX) {
    errors.push(`reason must be ${STRING_CONSTRAINTS.REASON_MAX} characters or less`);
  }

  if (!data.voidedBy) {
    errors.push("voidedBy is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate child creation/update
 */
export function validateChild(data: any, isUpdate = false): ValidationResult {
  const errors: string[] = [];

  // Name validation
  if (!isUpdate || data.name !== undefined) {
    if (!data.name) {
      errors.push("name is required");
    } else if (data.name.length < STRING_CONSTRAINTS.NAME_MIN) {
      errors.push(`name must be at least ${STRING_CONSTRAINTS.NAME_MIN} characters`);
    } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
      errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
    }
  }

  // Avatar validation
  if (data.avatar !== undefined) {
    if (!VALID_ENUMS.CHILD_AVATAR.includes(data.avatar)) {
      errors.push(`avatar must be one of: ${VALID_ENUMS.CHILD_AVATAR.join(", ")}`);
    }
  }

  // PIN validation
  if (!isUpdate || data.pin !== undefined) {
    if (!data.pin) {
      errors.push("pin is required");
    } else if (!/^\d{4}$/.test(data.pin)) {
      errors.push("pin must be exactly 4 digits");
    }
  }

  // Family ID validation
  if (!isUpdate) {
    if (!data.familyId) {
      errors.push("familyId is required");
    }
  }

  // Daily cap validation
  if (data.dailyPointsCap !== undefined) {
    if (typeof data.dailyPointsCap !== "number") {
      errors.push("dailyPointsCap must be a number");
    } else if (data.dailyPointsCap < 0 || data.dailyPointsCap > 500) {
      errors.push("dailyPointsCap must be between 0 and 500");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate family creation
 */
export function validateFamily(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length < STRING_CONSTRAINTS.NAME_MIN) {
    errors.push(`name must be at least ${STRING_CONSTRAINTS.NAME_MIN} characters`);
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate user signup
 */
export function validateSignup(data: any): ValidationResult {
  const errors: string[] = [];

  // Name validation
  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length < STRING_CONSTRAINTS.NAME_MIN) {
    errors.push(`name must be at least ${STRING_CONSTRAINTS.NAME_MIN} characters`);
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  // Email validation
  if (!data.email) {
    errors.push("email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push("email must be a valid email address");
  } else if (data.email.length > STRING_CONSTRAINTS.EMAIL_MAX) {
    errors.push(`email must be ${STRING_CONSTRAINTS.EMAIL_MAX} characters or less`);
  }

  // Password validation
  if (!data.password) {
    errors.push("password is required");
  } else if (data.password.length < 8) {
    errors.push("password must be at least 8 characters");
  } else if (data.password.length > 72) {
    errors.push("password must be 72 characters or less");
  }

  // Family name validation (optional - may be joining existing family)
  if (data.familyName) {
    if (data.familyName.length < STRING_CONSTRAINTS.NAME_MIN) {
      errors.push(`familyName must be at least ${STRING_CONSTRAINTS.NAME_MIN} characters`);
    } else if (data.familyName.length > STRING_CONSTRAINTS.NAME_MAX) {
      errors.push(`familyName must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate invite creation
 */
export function validateInvite(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.email) {
    errors.push("email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push("email must be a valid email address");
  }

  if (!data.familyId) {
    errors.push("familyId is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate invite acceptance
 */
export function validateInviteAccept(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.inviteCode) {
    errors.push("inviteCode is required");
  } else if (!/^[A-Z0-9]{6}$/.test(data.inviteCode.toUpperCase())) {
    errors.push("inviteCode must be 6 alphanumeric characters");
  }

  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length < STRING_CONSTRAINTS.NAME_MIN) {
    errors.push(`name must be at least ${STRING_CONSTRAINTS.NAME_MIN} characters`);
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (!data.email) {
    errors.push("email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push("email must be a valid email address");
  }

  if (!data.password) {
    errors.push("password is required");
  } else if (data.password.length < 8) {
    errors.push("password must be at least 8 characters");
  } else if (data.password.length > 72) {
    errors.push("password must be 72 characters or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate PIN verification request
 */
export function validatePinVerify(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.pin) {
    errors.push("pin is required");
  } else if (!/^\d{4,6}$/.test(data.pin)) {
    errors.push("pin must be 4-6 digits");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate provider data
 */
export function validateProvider(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length < STRING_CONSTRAINTS.NAME_MIN) {
    errors.push(`name must be at least ${STRING_CONSTRAINTS.NAME_MIN} characters`);
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (data.type && !['school', 'madrasa', 'tutor', 'extracurricular', 'other'].includes(data.type)) {
    errors.push("type must be one of: school, madrasa, tutor, extracurricular, other");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate attendance record
 */
export function validateAttendance(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.childId) {
    errors.push("childId is required");
  }

  if (!data.providerId) {
    errors.push("providerId is required");
  }

  if (!data.classDate) {
    errors.push("classDate is required");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.classDate)) {
    errors.push("classDate must be in YYYY-MM-DD format");
  }

  if (!data.status) {
    errors.push("status is required");
  } else if (!['present', 'absent', 'excused', 'late'].includes(data.status)) {
    errors.push("status must be one of: present, absent, excused, late");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate milestone data
 */
export function validateMilestone(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (data.points === undefined || data.points === null) {
    errors.push("points is required");
  } else if (typeof data.points !== 'number' || data.points < 0) {
    errors.push("points must be a non-negative number");
  } else if (data.points > 10000) {
    errors.push("points must be 10000 or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate reward data
 */
export function validateReward(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (data.pointCost === undefined || data.pointCost === null) {
    errors.push("pointCost is required");
  } else if (typeof data.pointCost !== 'number' || data.pointCost <= 0) {
    errors.push("pointCost must be a positive number");
  } else if (data.pointCost > 10000) {
    errors.push("pointCost must be 10000 or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate wishlist item data
 */
export function validateWishlistItem(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.childId) {
    errors.push("childId is required");
  }

  if (!data.wishText && !data.audioUrl) {
    errors.push("either wishText or audioUrl is required");
  }

  if (data.wishText && data.wishText.length > 500) {
    errors.push("wishText must be 500 characters or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate redemption request data
 */
export function validateRedemptionRequest(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.childId) {
    errors.push("childId is required");
  }

  if (!data.rewardId) {
    errors.push("rewardId is required");
  }

  if (data.notes && data.notes.length > 500) {
    errors.push("notes must be 500 characters or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate quiz data
 */
export function validateQuiz(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.title) {
    errors.push("title is required");
  } else if (data.title.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`title must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (!data.questions || !Array.isArray(data.questions)) {
    errors.push("questions must be an array");
  } else if (data.questions.length === 0) {
    errors.push("quiz must have at least one question");
  } else if (data.questions.length > 50) {
    errors.push("quiz cannot have more than 50 questions");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate quiz attempt
 */
export function validateQuizAttempt(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.childId) {
    errors.push("childId is required");
  }

  if (!data.quizId) {
    errors.push("quizId is required");
  }

  if (!data.answers || !Array.isArray(data.answers)) {
    errors.push("answers must be an array");
  }

  if (data.pointsEarned === undefined || data.pointsEarned === null) {
    errors.push("pointsEarned is required");
  } else if (typeof data.pointsEarned !== 'number' || data.pointsEarned < 0) {
    errors.push("pointsEarned must be a non-negative number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate trackable item
 */
export function validateTrackableItem(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("name is required");
  } else if (data.name.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`name must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (!data.type) {
    errors.push("type is required");
  } else if (!VALID_ENUMS.TRACKABLE_TYPE.includes(data.type)) {
    errors.push(`type must be one of: ${VALID_ENUMS.TRACKABLE_TYPE.join(", ")}`);
  }

  if (data.points === undefined || data.points === null) {
    errors.push("points is required");
  } else if (typeof data.points !== "number") {
    errors.push("points must be a number");
  } else if (data.points < POINT_CONSTRAINTS.MIN || data.points > POINT_CONSTRAINTS.MAX) {
    errors.push(
      `points must be between ${POINT_CONSTRAINTS.MIN} and ${POINT_CONSTRAINTS.MAX}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate challenge data
 */
export function validateChallenge(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data.title) {
    errors.push("title is required");
  } else if (data.title.length > STRING_CONSTRAINTS.NAME_MAX) {
    errors.push(`title must be ${STRING_CONSTRAINTS.NAME_MAX} characters or less`);
  }

  if (!data.description) {
    errors.push("description is required");
  } else if (data.description.length > STRING_CONSTRAINTS.NOTES_MAX) {
    errors.push(`description must be ${STRING_CONSTRAINTS.NOTES_MAX} characters or less`);
  }

  if (!data.type) {
    errors.push("type is required");
  } else if (!VALID_ENUMS.CHALLENGE_TYPE.includes(data.type)) {
    errors.push(`type must be one of: ${VALID_ENUMS.CHALLENGE_TYPE.join(", ")}`);
  }

  if (data.bonusPoints !== undefined) {
    if (typeof data.bonusPoints !== "number") {
      errors.push("bonusPoints must be a number");
    } else if (data.bonusPoints < 0 || data.bonusPoints > 500) {
      errors.push("bonusPoints must be between 0 and 500");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate date string (YYYY-MM-DD format)
 */
export function validateDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Validate date is within reasonable range (not too far in past or future)
 */
export function validateDateRange(dateStr: string, maxYearsBack = 5, maxYearsFuture = 1): boolean {
  if (!validateDate(dateStr)) return false;
  
  const date = new Date(dateStr);
  const now = new Date();
  const minDate = new Date();
  minDate.setFullYear(now.getFullYear() - maxYearsBack);
  const maxDate = new Date();
  maxDate.setFullYear(now.getFullYear() + maxYearsFuture);
  
  return date >= minDate && date <= maxDate;
}

/**
 * Middleware: Validate request body against schema
 * 
 * Usage:
 *   app.post('/events', validate(validatePointEvent), handler)
 */
export function validate(validationFn: (data: any) => ValidationResult) {
  return async (c: Context, next: Function) => {
    let body;
    
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid JSON in request body",
        },
        400
      );
    }

    const result = validationFn(body);

    if (!result.valid) {
      return c.json(
        {
          error: "Validation Failed",
          message: "Request validation failed",
          details: result.errors,
        },
        400
      );
    }

    // Attach validated body to context
    c.set("validatedBody", body);

    await next();
  };
}

/**
 * Utility: Get validated body from context
 */
export function getValidatedBody<T = any>(c: Context): T {
  return c.get("validatedBody");
}