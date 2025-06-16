// src/middleware/auth.ts
import { RequestHandler } from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { skip } from "node:test";

const checkJwtProd = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER,
});

const skipJwt: RequestHandler = (_req, _res, next) => next();

// export const checkJwt =
//   process.env.NODE_ENV === "development" ? skipJwt : checkJwtProd;

// TODO: Skipping this for now as it's not ready. ECS health task will need a user at some point
export const checkJwt = skipJwt; // For local development, skip JWT check
