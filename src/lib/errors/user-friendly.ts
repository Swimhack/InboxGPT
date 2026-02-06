/**
 * User-Friendly Error Messages
 *
 * Maps technical errors to human-readable messages.
 * No more confusing "ECONNREFUSED" or "AUTHENTICATIONFAILED"!
 */

export interface FriendlyErrorInfo {
  title: string;
  description: string;
  action?: string;
  actionUrl?: string;
  actionLabel?: string;
  canRetry?: boolean;
}

// Error message mappings
const ERROR_MESSAGES: Record<string, FriendlyErrorInfo> = {
  // Authentication errors
  IMAP_AUTH_FAILED: {
    title: 'Login Failed',
    description:
      "The email or password you entered is incorrect. If you have 2-factor authentication enabled, you'll need to use an App Password instead of your regular password.",
    action: 'Learn about App Passwords',
    actionUrl: '/help#app-passwords',
    canRetry: true,
  },
  OAUTH_EXPIRED: {
    title: 'Connection Expired',
    description:
      'Your Google or Outlook connection has expired. Please reconnect your account to continue syncing.',
    actionLabel: 'Reconnect Account',
    actionUrl: '/accounts',
    canRetry: false,
  },
  OAUTH_REVOKED: {
    title: 'Access Revoked',
    description:
      "You've revoked Inbox Pro's access to your email. Reconnect to start syncing again.",
    actionLabel: 'Reconnect Account',
    actionUrl: '/accounts',
    canRetry: false,
  },

  // Connection errors
  IMAP_CONNECTION_FAILED: {
    title: "Can't Reach Email Server",
    description:
      "We couldn't connect to your email server. This might be a temporary issue - try again in a few minutes.",
    canRetry: true,
  },
  IMAP_TIMEOUT: {
    title: 'Connection Timed Out',
    description:
      "The email server took too long to respond. This usually happens when the server is busy. Try again in a moment.",
    canRetry: true,
  },
  NETWORK_ERROR: {
    title: 'No Internet Connection',
    description:
      "It looks like you're offline. Please check your internet connection and try again.",
    canRetry: true,
  },

  // AI errors
  AI_API_KEY_INVALID: {
    title: 'AI Not Configured',
    description:
      'The AI features require an API key to work. Please ask your administrator to add the API key.',
    canRetry: false,
  },
  AI_API_KEY_MISSING: {
    title: 'AI Not Set Up',
    description:
      'AI features are not configured yet. Email syncing will still work, but summaries and smart replies will be unavailable.',
    canRetry: false,
  },
  AI_RATE_LIMITED: {
    title: 'AI is Busy',
    description:
      "We're processing a lot of emails right now. AI features will catch up shortly - no action needed.",
    canRetry: true,
  },
  AI_PROCESSING_FAILED: {
    title: 'AI Processing Issue',
    description:
      "We had trouble analyzing this email. Don't worry, we'll try again automatically.",
    canRetry: true,
  },

  // Account errors
  ACCOUNT_NOT_FOUND: {
    title: 'Account Not Found',
    description:
      "This email account doesn't exist or has been removed. Try adding it again.",
    actionLabel: 'Add Account',
    actionUrl: '/accounts',
    canRetry: false,
  },
  ACCOUNT_DISABLED: {
    title: 'Account Disabled',
    description:
      'This email account has been disabled. Enable it in your account settings to resume syncing.',
    actionLabel: 'Manage Accounts',
    actionUrl: '/accounts',
    canRetry: false,
  },

  // Sync errors
  SYNC_IN_PROGRESS: {
    title: 'Sync Already Running',
    description:
      "Your emails are already being synced. Please wait for the current sync to complete.",
    canRetry: false,
  },
  SYNC_FAILED: {
    title: 'Sync Failed',
    description:
      "Something went wrong while syncing your emails. We'll try again automatically.",
    canRetry: true,
  },

  // Permission errors
  UNAUTHORIZED: {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again to continue.',
    actionLabel: 'Sign In',
    actionUrl: '/login',
    canRetry: false,
  },
  FORBIDDEN: {
    title: 'Access Denied',
    description: "You don't have permission to perform this action.",
    canRetry: false,
  },

  // Generic fallback
  UNKNOWN: {
    title: 'Something Went Wrong',
    description:
      "We encountered an unexpected issue. Please try again, or contact support if this continues.",
    canRetry: true,
  },
};

// Pattern matchers for technical error messages
const ERROR_PATTERNS: Array<{
  pattern: RegExp | string[];
  key: string;
}> = [
  // Authentication
  {
    pattern: ['AUTHENTICATIONFAILED', 'Invalid credentials', 'Login failed', 'authentication failed'],
    key: 'IMAP_AUTH_FAILED',
  },
  {
    pattern: ['token expired', 'invalid_grant', 'Token has been expired'],
    key: 'OAUTH_EXPIRED',
  },
  {
    pattern: ['access_denied', 'consent_required'],
    key: 'OAUTH_REVOKED',
  },

  // Connection
  {
    pattern: ['ECONNREFUSED', 'ENOTFOUND', 'connection refused', 'getaddrinfo'],
    key: 'IMAP_CONNECTION_FAILED',
  },
  {
    pattern: ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'timed out', 'timeout'],
    key: 'IMAP_TIMEOUT',
  },
  {
    pattern: ['ENETUNREACH', 'EHOSTUNREACH', 'network is unreachable', 'Failed to fetch'],
    key: 'NETWORK_ERROR',
  },

  // AI
  {
    pattern: ['invalid api key', 'Incorrect API key', 'API key not valid'],
    key: 'AI_API_KEY_INVALID',
  },
  {
    pattern: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'API key is not set'],
    key: 'AI_API_KEY_MISSING',
  },
  {
    pattern: ['rate limit', 'rate_limit', '429', 'Too Many Requests'],
    key: 'AI_RATE_LIMITED',
  },

  // Account
  {
    pattern: ['Account not found', 'account does not exist'],
    key: 'ACCOUNT_NOT_FOUND',
  },
  {
    pattern: ['not active', 'disabled'],
    key: 'ACCOUNT_DISABLED',
  },

  // Sync
  {
    pattern: ['already syncing', 'sync in progress', 'Sync already in progress'],
    key: 'SYNC_IN_PROGRESS',
  },

  // Auth
  {
    pattern: ['Unauthorized', '401', 'not authenticated'],
    key: 'UNAUTHORIZED',
  },
  {
    pattern: ['Forbidden', '403', 'Access denied'],
    key: 'FORBIDDEN',
  },
];

/**
 * Convert a technical error to a user-friendly error message
 */
export function getUserFriendlyError(error: Error | string | unknown): FriendlyErrorInfo {
  const errorString = getErrorString(error);
  const lowerError = errorString.toLowerCase();

  // Try to match against known patterns
  for (const { pattern, key } of ERROR_PATTERNS) {
    if (Array.isArray(pattern)) {
      // String array - check if any string is included
      for (const p of pattern) {
        if (lowerError.includes(p.toLowerCase())) {
          return ERROR_MESSAGES[key];
        }
      }
    } else {
      // Regex pattern
      if (pattern.test(errorString)) {
        return ERROR_MESSAGES[key];
      }
    }
  }

  // Check for HTTP status codes
  if (errorString.includes('404')) {
    return ERROR_MESSAGES.ACCOUNT_NOT_FOUND;
  }
  if (errorString.includes('401')) {
    return ERROR_MESSAGES.UNAUTHORIZED;
  }
  if (errorString.includes('403')) {
    return ERROR_MESSAGES.FORBIDDEN;
  }
  if (errorString.includes('500') || errorString.includes('502') || errorString.includes('503')) {
    return {
      title: 'Server Error',
      description: "Our servers are having trouble right now. Please try again in a few minutes.",
      canRetry: true,
    };
  }

  // Return generic error with original message in description for debugging
  return {
    ...ERROR_MESSAGES.UNKNOWN,
    description: process.env.NODE_ENV === 'development'
      ? `${ERROR_MESSAGES.UNKNOWN.description} (${errorString})`
      : ERROR_MESSAGES.UNKNOWN.description,
  };
}

/**
 * Get error message by key (for direct access)
 */
export function getErrorByKey(key: string): FriendlyErrorInfo {
  return ERROR_MESSAGES[key] || ERROR_MESSAGES.UNKNOWN;
}

/**
 * Extract error string from various error types
 */
function getErrorString(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }
  }
  return String(error);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error | string | unknown): boolean {
  const friendly = getUserFriendlyError(error);
  return friendly.canRetry ?? false;
}
