const requestedBrowser = process.env.TARGET_BROWSER ?? 'chrome';
const targetFamily = requestedBrowser === 'firefox' ? 'firefox' : 'chromium';

console.log(`Browser shell wiring is static; TARGET_BROWSER=${requestedBrowser} (${targetFamily})`);
