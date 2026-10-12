import { readLocalSchemes } from './localSchemeStore.js';
import { refreshExternalFeeds } from './externalFeeds.js';

export async function getUnifiedSchemes() {
  const local = await readLocalSchemes() ?? [];
  const feeds = await refreshExternalFeeds();
  return {
    local,
    feeds: feeds.feeds,
    lastSyncedAt: feeds.lastSyncedAt,
  };
}
