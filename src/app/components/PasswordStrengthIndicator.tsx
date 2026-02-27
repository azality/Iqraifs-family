import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
  showRequirements?: boolean;
}

interface StrengthResult {
  score: number; // 0-4
  label: string;
  color: string;
  bgColor: string;
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export function PasswordStrengthIndicator({ 
  password, 
  showRequirements = true 
}: PasswordStrengthIndicatorProps) {
  const strength = useMemo((): StrengthResult => {
    const requirements = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };

    // Calculate score based on requirements met
    const requirementsMet = Object.values(requirements).filter(Boolean).length;
    let score = 0;
    let label = 'Too weak';
    let color = 'text-gray-400';
    let bgColor = 'bg-gray-200';

    if (password.length === 0) {
      score = 0;
      label = '';
      color = 'text-gray-400';
      bgColor = 'bg-gray-200';
    } else if (requirementsMet <= 2) {
      score = 1;
      label = 'Weak';
      color = 'text-red-600';
      bgColor = 'bg-red-500';
    } else if (requirementsMet === 3) {
      score = 2;
      label = 'Fair';
      color = 'text-orange-600';
      bgColor = 'bg-orange-500';
    } else if (requirementsMet === 4) {
      score = 3;
      label = 'Good';
      color = 'text-yellow-600';
      bgColor = 'bg-yellow-500';
    } else {
      score = 4;
      label = 'Strong';
      color = 'text-green-600';
      bgColor = 'bg-green-500';
    }

    return { score, label, color, bgColor, requirements };
  }, [password]);

  if (password.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mt-2">
      {/* Strength Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                level <= strength.score ? strength.bgColor : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        {strength.label && (
          <span className={`text-xs font-medium ${strength.color}`}>
            {strength.label}
          </span>
        )}
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="space-y-1 text-xs">
          <RequirementItem
            met={strength.requirements.minLength}
            label="At least 8 characters"
          />
          <RequirementItem
            met={strength.requirements.hasUppercase}
            label="One uppercase letter"
          />
          <RequirementItem
            met={strength.requirements.hasLowercase}
            label="One lowercase letter"
          />
          <RequirementItem
            met={strength.requirements.hasNumber}
            label="One number"
          />
          <RequirementItem
            met={strength.requirements.hasSpecial}
            label="One special character (!@#$%...)"
          />
        </div>
      )}
    </div>
  );
}

function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${met ? 'text-green-600' : 'text-gray-500'}`}>
      {met ? (
        <Check className="w-3 h-3" />
      ) : (
        <X className="w-3 h-3" />
      )}
      <span>{label}</span>
    </div>
  );
}

/**
 * Validate password meets minimum requirements
 * Use this in form validation before submission
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
