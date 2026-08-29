import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentUser } from "./current-user.decorator.js";
import { IdentityService, type JwtPayload } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post("identity/register")
  register(@Body() body: unknown) {
    return this.identityService.register(body);
  }

  @Post("identity/login")
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.identityService.login(body);
  }

  @Get("identity/me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.identityService.getMe(user.sub);
  }

  @Get("identity/handle-availability")
  @UseGuards(JwtAuthGuard)
  handleAvailability(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.identityService.getHandleAvailability(user.sub, query);
  }

  @Patch("identity/me")
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.updateProfile(user.sub, body);
  }

  @Post("identity/avatar")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  uploadAvatar(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.uploadAvatar(user.sub, body);
  }

  @Get("identity/avatar")
  @UseGuards(JwtAuthGuard)
  async getAvatar(@CurrentUser() user: JwtPayload, @Res() reply: FastifyReply) {
    const bytes = await this.identityService.getAvatarBytes(user.sub);
    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(Buffer.from(bytes));
  }
}
