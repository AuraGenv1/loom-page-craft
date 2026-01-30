/**
 * Unsplash API Compliance Utilities
 * Per Unsplash guidelines, the download_location endpoint must be triggered
 * when a user actually downloads/uses an image (not just views it).
 * 
 * @see https://help.unsplash.com/en/articles/2511258-guideline-triggering-a-download
 */

/**
 * Trigger Unsplash download tracking
 * This must be called when a user actually uses/downloads an image (not just views it).
 * The download_location URL already includes the client_id from the API response.
 * 
 * @param downloadLocation - The download_location URL from the Unsplash API response
 */
export async function triggerUnsplashDownload(downloadLocation: string): Promise<void> {
  if (!downloadLocation) return;
  
  try {
    // Fire-and-forget background request
    // Using no-cors because Unsplash doesn't require response handling
    // and we don't want CORS issues to block the user action
    await fetch(downloadLocation, {
      method: 'GET',
      mode: 'no-cors',
    });
    console.log('[Unsplash] Download tracked:', downloadLocation.substring(0, 60) + '...');
  } catch (error) {
    // Non-blocking - don't fail the user action if tracking fails
    // This is intentionally fire-and-forget
    console.warn('[Unsplash] Download tracking failed:', error);
  }
}
