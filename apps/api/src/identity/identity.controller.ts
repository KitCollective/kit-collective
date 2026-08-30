import {
  Body,
  Controller,
  Delete,
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

  @Get("identity/prefs")
  @UseGuards(JwtAuthGuard)
  getPrefs(@CurrentUser() user: JwtPayload) {
    return this.identityService.getPrefs(user.sub);
  }

  @Patch("identity/prefs")
  @UseGuards(JwtAuthGuard)
  updatePrefs(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.updatePrefs(user.sub, body);
  }

  @Get("identity/cookie-consent")
  @UseGuards(JwtAuthGuard)
  getCookieConsent(@CurrentUser() user: JwtPayload) {
    return this.identityService.getCookieConsent(user.sub);
  }

  @Patch("identity/cookie-consent")
  @UseGuards(JwtAuthGuard)
  updateCookieConsent(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.updateCookieConsent(user.sub, body);
  }

  @Get("identity/export")
  @UseGuards(JwtAuthGuard)
  exportAccount(@CurrentUser() user: JwtPayload) {
    return this.identityService.exportAccountData(user.sub);
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

  @Patch("identity/account")
  @UseGuards(JwtAuthGuard)
  updateAccount(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.updateAccount(user.sub, body);
  }

  @Post("identity/password")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.changePassword(user.sub, body);
  }

  @Post("identity/email")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changeEmail(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.identityService.changeEmail(user.sub, body);
  }

  @Post("identity/logout")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logout() {
    return;
  }

  @Delete("identity/me")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  deleteAccount(@CurrentUser() user: JwtPayload) {
    return this.identityService.deleteAccount(user.sub);
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
