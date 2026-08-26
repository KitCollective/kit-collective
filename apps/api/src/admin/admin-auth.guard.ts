import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "../identity/identity.service.js";

@Injectable()
export class AdminAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser extends JwtPayload>(
    err: Error | null,
    user: TUser | false,
    _info: unknown,
  ): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    if (user.role !== "admin") {
      throw new ForbiddenException("Staff access required");
    }
    return user;
  }
}
