/**
 * Vercel Speed Insights initialization
 * This module imports and injects the Speed Insights tracking script
 */
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Speed Insights
// This will automatically track web vitals and performance metrics
// Debug mode is enabled in development, disabled in production
injectSpeedInsights({
  debug: false, // Set to true for development debugging
});
