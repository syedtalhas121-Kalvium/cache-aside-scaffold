import { Router } from "express";
import { prisma, slowQuery } from "../db.js";
import { redis } from "../redis.js";
import { cached } from "../cache/cached.js";
import { invalidate } from "../cache/invalidation.js";

const router = Router();

// READ (hot): GET /posts/feed?page=1&sort=new|hot
router.get("/posts/feed", async (req, res, next) => {
  try {
    const pageValue = Number.parseInt(req.query.page ?? "1", 10);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const sort = req.query.sort === "hot" ? "hot" : "new";
    const version = (await redis.get("posts:feed:ver")) ?? "0";
    const key = `posts:feed:v${version}:page:${page}:sort:${sort}`;

    const feed = await cached(key, 60, async () => {
      await slowQuery(); // simulates a heavy, disk-backed query
      return prisma.post.findMany({
        orderBy: sort === "hot" ? { likes: "desc" } : { createdAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
        include: { author: true },
      });
    });

    res.json(feed);
  } catch (error) {
    next(error);
  }
});

// WRITE: POST /posts { title, body, authorId }
router.post("/posts", async (req, res, next) => {
  try {
    const post = await prisma.post.create({ data: req.body });
    await invalidate.onNewPost();
    res.status(201).json(post);
  } catch (error) {
    next(error);
  }
});

export default router;
