import {
  adminCollectorJerseyParamsSchema,
  adminCollectorPhotoParamsSchema,
  adminCollectorQuerySchema,
  adminCollectorUserIdParamSchema,
  adminRoleUpdateRequestSchema,
} from "@kit/api-contract";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminCollectionService } from "./admin-collection.service.js";

@Controller("admin/collectors")
@UseGuards(AdminAuthGuard)
export class AdminCollectionController {
  constructor(private readonly adminCollectionService: AdminCollectionService) {}

  @Get()
  listCollectors(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = adminCollectorQuerySchema.safeParse({
      q: typeof query.q === "string" ? query.q : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid collectors query");
    }
    return this.adminCollectionService.listCollectors(parsed.data);
  }

  @Get("jerseys")
  listAllJerseys(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = adminCollectorQuerySchema.safeParse({
      q: typeof query.q === "string" ? query.q : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid collectors query");
    }
    return this.adminCollectionService.listAllJerseys(parsed.data);
  }

  @Get(":userId")
  getCollector(@Param() params: Record<string, string>) {
    const parsed = adminCollectorUserIdParamSchema.safeParse({ userId: params.userId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid user id");
    }
    return this.adminCollectionService.getCollector(parsed.data.userId);
  }

  @Get(":userId/jerseys")
  listCollectorJerseys(@Param() params: Record<string, string>) {
    const parsed = adminCollectorUserIdParamSchema.safeParse({ userId: params.userId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid user id");
    }
    return this.adminCollectionService.listCollectorJerseys(parsed.data.userId);
  }

  @Get(":userId/jerseys/:jerseyId")
  getCollectorJersey(@Param() params: Record<string, string>) {
    const parsed = adminCollectorJerseyParamsSchema.safeParse({
      userId: params.userId,
      jerseyId: params.jerseyId,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid jersey id");
    }
    return this.adminCollectionService.getCollectorJersey(parsed.data.userId, parsed.data.jerseyId);
  }

  @Get(":userId/jerseys/:jerseyId/photos/:photoId")
  async getCollectorPhoto(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminCollectorPhotoParamsSchema.safeParse({
      userId: params.userId,
      jerseyId: params.jerseyId,
      photoId: params.photoId,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid photo id");
    }
    const bytes = await this.adminCollectionService.getCollectorPhotoBytes(
      parsed.data.userId,
      parsed.data.jerseyId,
      parsed.data.photoId,
    );
    return reply.type("image/jpeg").send(Buffer.from(bytes));
  }

  @Delete(":userId/jerseys/:jerseyId")
  @HttpCode(204)
  async takeDownJersey(@Param() params: Record<string, string>) {
    const parsed = adminCollectorJerseyParamsSchema.safeParse({
      userId: params.userId,
      jerseyId: params.jerseyId,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid jersey id");
    }
    await this.adminCollectionService.takeDownJersey(parsed.data.userId, parsed.data.jerseyId);
  }

  @Patch(":userId/role")
  updateUserRole(
    @CurrentUser() actor: JwtPayload,
    @Param() params: Record<string, string>,
    @Body() body: unknown,
  ) {
    const parsedUser = adminCollectorUserIdParamSchema.safeParse({ userId: params.userId });
    if (!parsedUser.success) {
      throw new BadRequestException("Invalid user id");
    }
    const parsedBody = adminRoleUpdateRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException("Invalid role update");
    }
    return this.adminCollectionService.updateUserRole(
      actor.sub,
      parsedUser.data.userId,
      parsedBody.data,
    );
  }
}
