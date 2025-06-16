import { Router } from "express";
import db from "../db";
import { checkJwt } from "../middleware/auth"; // we'll create this soon

const router = Router();

router.get("/", checkJwt, async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

export default router;
