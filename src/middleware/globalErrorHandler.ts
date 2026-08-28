import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "../errors/BadRequestError";
import { NotFoundError } from "../errors/NotFoundError";
import { Logger } from "../libs/loggers";

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  Logger.error({
    message: err.message,
    location: err.stack,
  });
  if (err instanceof BadRequestError) {
    return res.status(400).json(err.jsonResponse());
  } else if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message || "resource not found" });
  } else {
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Something went wrong",
      devErr:
        process.env.NODE_ENV === "development"
          ? { msg: err.message, stack: err.stack, name: err.name }
          : undefined,
    });
  }
};
