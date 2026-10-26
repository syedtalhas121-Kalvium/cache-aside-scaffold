import { redis } from "../redis.js";

/**
 * All cache invalidation rules live here.
 *
 * Feed entries are versioned, so one INCR retires every page/sort variant
 * without using Redis KEYS. Old versions expire naturally through their TTL.
 */
export const invalidate = {
  onNewPost: async () => {
    await redis.incr("posts:feed:ver");
  },
  onProfileEdit: async (userId) => {
    await redis.del("user:" + userId);
  },
};
