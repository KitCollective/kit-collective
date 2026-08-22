import {
  type IdentityMe,
  type IdentityRole,
  type IdentitySession,
  identityCredentialsSchema,
  identityMeSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { user } from "@kit/db";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { DB, type DbToken } from "../db/db.module.js";

const { hash, compare } = bcrypt;

export type JwtPayload = {
  sub: string;
  email: string;
  role: IdentityRole;
};

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DB) private readonly db: DbToken,
    private readonly jwtService: JwtService,
  ) {}

  async register(rawBody: unknown): Promise<IdentitySession> {
    const credentials = identityCredentialsSchema.parse(rawBody);
    const normalizedEmail = credentials.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await hash(credentials.password, 12);

    const [created] = await this.db
      .insert(user)
      .values({
        email: normalizedEmail,
        passwordHash,
      })
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
      });

    if (!created) {
      throw new ConflictException("Email already registered");
    }

    return this.buildSession(created);
  }

  async login(rawBody: unknown): Promise<IdentitySession> {
    const credentials = identityCredentialsSchema.parse(rawBody);
    const [found] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        passwordHash: user.passwordHash,
      })
      .from(user)
      .where(eq(user.email, credentials.email.toLowerCase()))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await compare(credentials.password, found.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.buildSession({
      id: found.id,
      email: found.email,
      role: found.role,
    });
  }

  async getMe(userId: string): Promise<IdentityMe> {
    const [found] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    return identityMeSchema.parse(found);
  }

  private buildSession(row: { id: string; email: string; role: IdentityRole }): IdentitySession {
    const payload: JwtPayload = {
      sub: row.id,
      email: row.email,
      role: row.role,
    };

    return identitySessionSchema.parse({
      accessToken: this.jwtService.sign(payload),
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
      },
    });
  }
}
