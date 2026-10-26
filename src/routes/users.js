import { Router } from "express";
import { prisma, slowQuery } from "../db.js";
import { cached } from "../cache/cached.js";
import { invalidate } from "../cache/invalidation.js";

const router = Router();

// READ: GET /users/:id
router.get("/users/:id", async (req, res, next) => {
  try {
    const user = await cached(`user:${req.params.id}`, 300, async () => {
      await slowQuery(); // simulates a heavy, disk-backed query
      return prisma.user.findUnique({
        where: { id: req.params.id },
        include: { posts: true },
      });
    });

    if (!user) return res.status(404).json({ error: "not found" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// WRITE: PUT /users/:id { name?, bio? }
router.put("/users/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await invalidate.onProfileEdit(req.params.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
