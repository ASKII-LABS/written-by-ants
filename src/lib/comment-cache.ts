const REDIS_REST_URL = process.env.REDIS_REST_URL?.trim();
const REDIS_REST_TOKEN = process.env.REDIS_REST_TOKEN?.trim();
const COMMENTS_CACHE_INDEX_PREFIX = "comments-cache:index";
const inMemoryPageCache = new Map<string, { expiresAt: number; value: CachedPoemCommentsPage }>();
const inMemoryPoemKeyIndex = new Map<string, Set<string>>();

type RedisCommandArg = string | number;
type RedisResponse<T> = {
  result?: T;
  error?: string;
};

type CachedPoemCommentsPage = {
  poem: {
    id: string;
    authorId: string;
    isPublished: boolean;
  };
  comments: Array<{
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: string;
    parentCommentId: string | null;
    likeCount: number;
    likedByViewer: boolean;
  }>;
  commentCount: number;
  nextCursor: string | null;
};

function isRedisConfigured() {
  return Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);
}

function getInMemoryIndex(poemId: string) {
  const existingIndex = inMemoryPoemKeyIndex.get(poemId);
  if (existingIndex) {
    return existingIndex;
  }

  const nextIndex = new Set<string>();
  inMemoryPoemKeyIndex.set(poemId, nextIndex);
  return nextIndex;
}

function getFromInMemoryCache(cacheKey: string) {
  const cachedEntry = inMemoryPageCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    inMemoryPageCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value;
}

async function runRedisCommand<T>(...args: RedisCommandArg[]) {
  if (!isRedisConfigured()) {
    return null;
  }

  try {
    const response = await fetch(REDIS_REST_URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as RedisResponse<T>;
    if (payload.error) {
      return null;
    }

    return payload.result ?? null;
  } catch {
    return null;
  }
}

function getCommentCacheIndexKey(poemId: string) {
  return `${COMMENTS_CACHE_INDEX_PREFIX}:${poemId}`;
}

export function getPoemCommentsCacheKey({
  poemId,
  sort,
  limit,
}: {
  poemId: string;
  sort: "asc" | "desc";
  limit: number;
}) {
  return `comments-cache:v4:${poemId}:sort:${sort}:limit:${limit}`;
}

export async function getCachedPoemCommentsPage(cacheKey: string) {
  if (!isRedisConfigured()) {
    return getFromInMemoryCache(cacheKey);
  }

  const cachedValue = await runRedisCommand<string | null>("GET", cacheKey);
  if (!cachedValue || typeof cachedValue !== "string") {
    return null;
  }

  try {
    return JSON.parse(cachedValue) as CachedPoemCommentsPage;
  } catch {
    return null;
  }
}

export async function cachePoemCommentsPage({
  poemId,
  cacheKey,
  value,
  ttlSeconds,
}: {
  poemId: string;
  cacheKey: string;
  value: CachedPoemCommentsPage;
  ttlSeconds: number;
}) {
  if (!isRedisConfigured()) {
    inMemoryPageCache.set(cacheKey, {
      expiresAt: Date.now() + Math.max(1, Math.floor(ttlSeconds)) * 1000,
      value,
    });
    getInMemoryIndex(poemId).add(cacheKey);
    return;
  }

  const serialized = JSON.stringify(value);
  const indexKey = getCommentCacheIndexKey(poemId);
  await Promise.all([
    runRedisCommand("SET", cacheKey, serialized, "EX", Math.max(1, Math.floor(ttlSeconds))),
    runRedisCommand("SADD", indexKey, cacheKey),
    runRedisCommand("EXPIRE", indexKey, Math.max(300, Math.floor(ttlSeconds * 10))),
  ]);
}

export async function invalidatePoemCommentsCache(poemId: string) {
  if (!isRedisConfigured()) {
    const indexedKeys = inMemoryPoemKeyIndex.get(poemId) ?? new Set<string>();
    indexedKeys.forEach((cacheKey) => {
      inMemoryPageCache.delete(cacheKey);
    });
    inMemoryPoemKeyIndex.delete(poemId);
    return;
  }

  const indexKey = getCommentCacheIndexKey(poemId);
  const cachedKeys = await runRedisCommand<string[]>("SMEMBERS", indexKey);

  if (Array.isArray(cachedKeys) && cachedKeys.length > 0) {
    await runRedisCommand("DEL", ...cachedKeys);
  }

  await runRedisCommand("DEL", indexKey);
}
