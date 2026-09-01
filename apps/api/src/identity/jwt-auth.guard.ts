import { user } from "@kit/db";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { DB, type DbToken } from "../db/db.module.js";
import { AUTH, type AuthInstance } from "./auth.js";
import type { JwtPayload } from "./identity.service.js";
import { headersFromRequest } from "./request-headers.js";

type RequestWithUser = FastifyRequest & { user?: JwtPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: AuthInstance,
    @Inject(DB) private readonly db: DbToken,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const session = await this.auth.api.getSession({
      headers: headersFromRequest(request),
    });

    if (!session?.user?.id) {
      throw new UnauthorizedException();
    }

    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!row) {
      throw new UnauthorizedException();
    }

    request.user = {
      sub: row.id,
      email: row.email,
      role: row.role,
    };
    return true;
  }
}
