import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { JwtPayload } from "./identity.service.js";

type RequestWithUser = FastifyRequest & { user?: JwtPayload };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new Error("CurrentUser used without JwtAuthGuard");
    }
    return request.user;
  },
);
