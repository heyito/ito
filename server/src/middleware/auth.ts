// src/middleware/auth.ts
import { RequestHandler } from "express";
import { auth } from "express-oauth2-jwt-bearer";

const checkJwtProd = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER,
});

const skipJwt: RequestHandler = (_req, _res, next) => next();

export const checkJwt =
  process.env.NODE_ENV === "development" ? skipJwt : checkJwtProd;
