# Cache-Aside + Stampede Protection — 2-Endpoint Scaffold

An Express + Prisma service demonstrating cache-aside, explicit invalidation, and Redis stampede protection.

## Endpoints

| Endpoint | Cache key | TTL | Invalidation |
|---|---|---:|---|
| `GET /posts/feed?page=&sort=new|hot` | `posts:feed:v<version>:page:<page>:sort:<sort>` | 60s | `POST /posts` increments `posts:feed:ver` |
| `GET /users/:id` | `user:<id>` | 300s | `PUT /users/:id` deletes only `user:<id>` |

## Setup

```bash
npm install
docker start redis-m4          # or your Redis; see .env.example for REDIS_URL
cp .env.example .env
npm run db:push
npm run seed                   # prints a seeded user id
npm start                      # http://localhost:3000
```

## Implementation notes

- `cached(key, ttl, fetcher)` checks Redis first and JSON-parses cache hits. On a miss it attempts `SET lock:<key> 1 NX EX 5`. The lock holder rechecks the cache, runs the fetcher, stores JSON with the requested TTL, and releases the lock in a `finally` block.
- Requests that don't get the lock poll the cache every ~50ms for up to one second, then fall back to the fetcher if the lock holder never populates the cache.
- Feed keys include the normalized page and sort values, so variants don't collide. The 60-second TTL limits staleness for a frequently changing feed.
- Profile keys include the user ID and use a 300-second TTL because profiles are expected to change less often than feed contents.
- A profile edit deletes only `user:<id>`; it does not evict other users' profiles.
- Feed invalidation uses a version counter. Every new post increments `posts:feed:ver`; the next feed read builds keys with the new version, retiring all previous page/sort variants in one O(1) operation. Old entries expire through their TTL. No Redis `KEYS` command is used.

## Verify invalidation

Start the server, then run the following with the user ID printed by `npm run seed`:

```bash
AUTHOR_ID=<seeded-user-id> npm run verify
```

Both checks should print `PASS`.

## Load testing

Run these commands once against the uncached baseline (before applying the cache changes, or with caching disabled) and again after the cache is warm. Use the same machine, seed data, and command arguments for a fair comparison.

```bash
# Preferred, when wrk is installed:
wrk -t4 -c50 -d10s --latency http://localhost:3000/posts/feed
wrk -t4 -c50 -d10s --latency http://localhost:3000/users/<id>

# Cross-platform stand-in:
node scripts/load.js /posts/feed 50 2000
node scripts/load.js /users/<id> 50 2000
```

### Results (before → after)

| Endpoint | req/s before | req/s after | p50 before → after | p99 before → after |
|---|---:|---:|---|---|
| `GET /posts/feed` | Not measured in this environment | Run locally | Not measured | Run locally |
| `GET /users/:id` | Not measured in this environment | Run locally | Not measured | Run locally |

**Measurement note:** I have not filled in fabricated benchmark figures. Run the commands above locally with Redis and the server running, then replace these cells with the observed before/after values. The expected result is higher throughput and warm-cache p50/p99 much closer together.

## Submission checklist

- [x] Cache-aside helper with Redis NX/EX stampede lock
- [x] Parameter-aware cache keys and endpoint-specific TTLs
- [x] Centralized invalidation wired to both writes
- [x] Versioned feed invalidation without `KEYS`
- [ ] Run `npm run verify` locally and confirm both checks pass
- [ ] Add actual before/after load-test measurements above
