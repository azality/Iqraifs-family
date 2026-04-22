/**
 * Production Monitoring System
 * 
 * Provides centralized error tracking, metrics collection, and
 * monitoring endpoints for production observability.
 * 
 * Key Metrics Tracked:
 * - 401/403/500 error rates
 * - Kid login success rate
 * - Rate limit violations
 * - API response times
 * - Database query performance
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// ================================================================
// METRICS STORAGE
// ================================================================

interface Metric {
  timestamp: string;
  type: 'error' | 'login' | 'rate_limit' | 'performance';
  category: string;
  value: number;
  metadata?: Record<string, any>;
}

// In-memory metrics (last 1 hour)
// In production, use a time-series database or monitoring service
const metricsBuffer: Metric[] = [];
const MAX_BUFFER_SIZE = 10000;

// Clean old metrics (older than 1 hour)
function cleanOldMetrics() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const cutoffTime = new Date(oneHourAgo).toISOString();
  
  let removed = 0;
  while (metricsBuffer.length > 0 && metricsBuffer[0].timestamp < cutoffTime) {
    metricsBuffer.shift();
    removed++;
  }
  
  if (removed > 0) {
    console.log(`🧹 Cleaned ${removed} old metrics from buffer`);
  }
}

// ================================================================
// METRIC RECORDING
// ================================================================

export function recordMetric(
  type: Metric['type'],
  category: string,
  value: number,
  metadata?: Record<string, any>
): void {
  const metric: Metric = {
    timestamp: new Date().toISOString(),
    type,
    category,
    value,
    metadata
  };
  
  metricsBuffer.push(metric);
  
  // Clean old metrics if buffer is getting large
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    cleanOldMetrics();
  }
  
  // Log critical errors immediately
  if (type === 'error' && (category === '500' || category === 'critical')) {
    console.error('🚨 CRITICAL ERROR:', metric);
  }
}

// ================================================================
// ERROR TRACKING
// ================================================================

export function trackError(
  statusCode: number,
  endpoint: string,
  error: Error | string,
  userId?: string
): void {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  // Record metric
  recordMetric('error', statusCode.toString(), 1, {
    endpoint,
    message: errorMessage,
    stack: errorStack,
    userId
  });
  
  // Structured logging for ingestion by monitoring tools
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    statusCode,
    endpoint,
    message: errorMessage,
    stack: errorStack,
    userId,
    service: 'fgs-api'
  }));
}

// ================================================================
// LOGIN TRACKING
// ================================================================

export function trackKidLogin(
  success: boolean,
  childId?: string,
  familyCode?: string,
  errorReason?: string
): void {
  recordMetric('login', success ? 'success' : 'failure', 1, {
    childId,
    familyCode,
    errorReason
  });
  
  // Structured logging
  console.log(JSON.stringify({
    level: 'info',
    timestamp: new Date().toISOString(),
    event: 'kid_login',
    success,
    childId,
    familyCode,
    errorReason,
    service: 'fgs-api'
  }));
}

// ================================================================
// RATE LIMIT TRACKING
// ================================================================

export function trackRateLimit(
  endpoint: string,
  identifier: string,
  limitType: 'api' | 'kid_login'
): void {
  recordMetric('rate_limit', limitType, 1, {
    endpoint,
    identifier
  });
  
  // Structured logging
  console.warn(JSON.stringify({
    level: 'warn',
    timestamp: new Date().toISOString(),
    event: 'rate_limit_exceeded',
    endpoint,
    identifier,
    limitType,
    service: 'fgs-api'
  }));
}

// ================================================================
// PERFORMANCE TRACKING
// ================================================================

export function trackPerformance(
  endpoint: string,
  durationMs: number,
  metadata?: Record<string, any>
): void {
  recordMetric('performance', endpoint, durationMs, metadata);
  
  // Log slow requests (> 1 second)
  if (durationMs > 1000) {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      event: 'slow_request',
      endpoint,
      durationMs,
      metadata,
      service: 'fgs-api'
    }));
  }
}

// ================================================================
// METRICS AGGREGATION
// ================================================================

interface MetricsSummary {
  timeWindow: string;
  errors: {
    total: number;
    by_status: Record<string, number>;
    rate_per_minute: number;
  };
  kidLogins: {
    total: number;
    successful: number;
    failed: number;
    success_rate: number;
    rate_per_minute: number;
  };
  rateLimits: {
    total: number;
    by_type: Record<string, number>;
    rate_per_minute: number;
  };
  performance: {
    avg_response_time_ms: number;
    p95_response_time_ms: number;
    p99_response_time_ms: number;
    slow_requests: number;
  };
}

export function getMetricsSummary(windowMinutes: number = 60): MetricsSummary {
  cleanOldMetrics();
  
  const now = Date.now();
  const windowStart = now - (windowMinutes * 60 * 1000);
  const windowStartTime = new Date(windowStart).toISOString();
  
  // Filter metrics to time window
  const windowMetrics = metricsBuffer.filter(m => m.timestamp >= windowStartTime);
  
  // Error metrics
  const errorMetrics = windowMetrics.filter(m => m.type === 'error');
  const errorsByStatus: Record<string, number> = {};
  errorMetrics.forEach(m => {
    errorsByStatus[m.category] = (errorsByStatus[m.category] || 0) + 1;
  });
  
  // Login metrics
  const loginMetrics = windowMetrics.filter(m => m.type === 'login');
  const successfulLogins = loginMetrics.filter(m => m.category === 'success').length;
  const failedLogins = loginMetrics.filter(m => m.category === 'failure').length;
  const totalLogins = successfulLogins + failedLogins;
  const successRate = totalLogins > 0 ? (successfulLogins / totalLogins) * 100 : 0;
  
  // Rate limit metrics
  const rateLimitMetrics = windowMetrics.filter(m => m.type === 'rate_limit');
  const rateLimitsByType: Record<string, number> = {};
  rateLimitMetrics.forEach(m => {
    rateLimitsByType[m.category] = (rateLimitsByType[m.category] || 0) + 1;
  });
  
  // Performance metrics
  const perfMetrics = windowMetrics.filter(m => m.type === 'performance');
  const responseTimes = perfMetrics.map(m => m.value).sort((a, b) => a - b);
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
    : 0;
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p99Index = Math.floor(responseTimes.length * 0.99);
  const p95ResponseTime = responseTimes.length > 0 ? responseTimes[p95Index] || 0 : 0;
  const p99ResponseTime = responseTimes.length > 0 ? responseTimes[p99Index] || 0 : 0;
  const slowRequests = responseTimes.filter(t => t > 1000).length;
  
  return {
    timeWindow: `${windowMinutes} minutes`,
    errors: {
      total: errorMetrics.length,
      by_status: errorsByStatus,
      rate_per_minute: errorMetrics.length / windowMinutes
    },
    kidLogins: {
      total: totalLogins,
      successful: successfulLogins,
      failed: failedLogins,
      success_rate: Math.round(successRate * 100) / 100,
      rate_per_minute: totalLogins / windowMinutes
    },
    rateLimits: {
      total: rateLimitMetrics.length,
      by_type: rateLimitsByType,
      rate_per_minute: rateLimitMetrics.length / windowMinutes
    },
    performance: {
      avg_response_time_ms: Math.round(avgResponseTime),
      p95_response_time_ms: Math.round(p95ResponseTime),
      p99_response_time_ms: Math.round(p99ResponseTime),
      slow_requests: slowRequests
    }
  };
}

// ================================================================
// HEALTH CHECK
// ================================================================

export async function getHealthStatus(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: { status: string; latency_ms?: number };
    api: { status: string; error_rate?: number };
    kid_login: { status: string; success_rate?: number };
  };
  metrics: MetricsSummary;
}> {
  const timestamp = new Date().toISOString();
  
  // Check database connectivity
  const dbStart = Date.now();
  let dbStatus = 'healthy';
  let dbLatency = 0;
  
  try {
    const { error } = await supabase.from('kv_store_f116e23f').select('key').limit(1);
    dbLatency = Date.now() - dbStart;
    
    if (error) {
      dbStatus = 'unhealthy';
      console.error('Database health check failed:', error);
    } else if (dbLatency > 1000) {
      dbStatus = 'degraded';
    }
  } catch (error) {
    dbStatus = 'unhealthy';
    console.error('Database health check error:', error);
  }
  
  // Get recent metrics
  const metrics = getMetricsSummary(5); // Last 5 minutes
  
  // Check API error rate
  const errorRate = metrics.errors.rate_per_minute;
  let apiStatus = 'healthy';
  if (errorRate > 10) {
    apiStatus = 'unhealthy';
  } else if (errorRate > 5) {
    apiStatus = 'degraded';
  }
  
  // Check kid login success rate
  const kidLoginSuccessRate = metrics.kidLogins.success_rate;
  let kidLoginStatus = 'healthy';
  if (kidLoginSuccessRate < 50) {
    kidLoginStatus = 'unhealthy';
  } else if (kidLoginSuccessRate < 90) {
    kidLoginStatus = 'degraded';
  }
  
  // Overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (dbStatus === 'unhealthy' || apiStatus === 'unhealthy' || kidLoginStatus === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (dbStatus === 'degraded' || apiStatus === 'degraded' || kidLoginStatus === 'degraded') {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    timestamp,
    checks: {
      database: { status: dbStatus, latency_ms: dbLatency },
      api: { status: apiStatus, error_rate: errorRate },
      kid_login: { status: kidLoginStatus, success_rate: kidLoginSuccessRate }
    },
    metrics
  };
}

// ================================================================
// ALERT THRESHOLDS
// ================================================================

export interface AlertRule {
  name: string;
  condition: (metrics: MetricsSummary) => boolean;
  severity: 'critical' | 'warning';
  message: string;
}

export const ALERT_RULES: AlertRule[] = [
  {
    name: '401_rate_high',
    condition: (m) => (m.errors.by_status['401'] || 0) > 50,
    severity: 'warning',
    message: '401 error rate is high - possible authentication issues'
  },
  {
    name: '403_rate_high',
    condition: (m) => (m.errors.by_status['403'] || 0) > 20,
    severity: 'warning',
    message: '403 error rate is high - possible authorization issues'
  },
  {
    name: '500_rate_critical',
    condition: (m) => (m.errors.by_status['500'] || 0) > 10,
    severity: 'critical',
    message: '500 error rate is critical - server errors detected'
  },
  {
    name: 'kid_login_success_low',
    condition: (m) => m.kidLogins.total > 10 && m.kidLogins.success_rate < 50,
    severity: 'critical',
    message: 'Kid login success rate is below 50% - critical issue'
  },
  {
    name: 'kid_login_success_degraded',
    condition: (m) => m.kidLogins.total > 10 && m.kidLogins.success_rate < 90,
    severity: 'warning',
    message: 'Kid login success rate is below 90% - degraded performance'
  },
  {
    name: 'rate_limit_violations_high',
    condition: (m) => m.rateLimits.total > 100,
    severity: 'warning',
    message: 'High rate limit violations detected - possible abuse'
  },
  {
    name: 'api_slow',
    condition: (m) => m.performance.p95_response_time_ms > 2000,
    severity: 'warning',
    message: 'P95 response time is over 2s - performance degradation'
  }
];

export function checkAlerts(windowMinutes: number = 5): Array<{
  rule: string;
  severity: string;
  message: string;
  triggeredAt: string;
}> {
  const metrics = getMetricsSummary(windowMinutes);
  const triggeredAlerts: Array<{
    rule: string;
    severity: string;
    message: string;
    triggeredAt: string;
  }> = [];
  
  for (const rule of ALERT_RULES) {
    if (rule.condition(metrics)) {
      triggeredAlerts.push({
        rule: rule.name,
        severity: rule.severity,
        message: rule.message,
        triggeredAt: new Date().toISOString()
      });
      
      // Log alert
      console.warn(JSON.stringify({
        level: rule.severity === 'critical' ? 'error' : 'warn',
        timestamp: new Date().toISOString(),
        event: 'alert_triggered',
        rule: rule.name,
        severity: rule.severity,
        message: rule.message,
        service: 'fgs-api'
      }));
    }
  }
  
  return triggeredAlerts;
}
