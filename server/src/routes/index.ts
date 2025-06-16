import { Router } from "express";
import db from "../db";

const router = Router();

router.get("/", (_req, res) => {
  res.send("Hello from the root route");
});

router.get("/users", async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).send("Server error");
  }
});

export default router;
