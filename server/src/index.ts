import express from "express";
import router from "./routes";
import dotenv from "dotenv";
import db from "./db";
import usersRouter from "./routes/users";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// TODO: Change this to Redis eventually if we scale beyond 2-3 tasks 
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
});

app.use(limiter);
app.use("/", router);

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

app.use("/users", usersRouter);

app.get("/ping-db", async (_req, res) => {
  try {
    await db.query("SELECT NOW()");
    res.send("DB connection ✅");
  } catch (err) {
    res.status(500).send("DB connection failed ❌\n" + err);
  }
});
