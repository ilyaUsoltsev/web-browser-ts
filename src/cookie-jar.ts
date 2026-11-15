// Shared by all URL instances and tabs for this browser process.
// Like the book, we keep one cookie per host.
export const COOKIE_JAR = new Map<string, string>();
