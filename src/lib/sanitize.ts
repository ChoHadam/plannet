import DOMPurify from 'dompurify';

/**
 * Sanitize user input to prevent XSS attacks
 * Removes all HTML tags and attributes
 */
export const sanitizeInput = (input: string): string => {
  if (typeof window === 'undefined') {
    // Server-side: simple escape
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
};

/**
 * Generate a simple UUID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};
