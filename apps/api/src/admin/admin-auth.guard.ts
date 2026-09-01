import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";

type RequestWithUser = FastifyRequest & { user?: JwtPayload };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly sessionGuard: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.sessionGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.role !== "admin") {
      throw new ForbiddenException("Staff access required");
    }
    return true;
  }
}
