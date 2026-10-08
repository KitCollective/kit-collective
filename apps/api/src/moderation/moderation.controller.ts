import { Body, Controller, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { ModerationService } from "./moderation.service.js";

@Controller()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("moderation/conversations/:conversationId/report")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  reportConversation(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: unknown,
  ) {
    return this.moderationService.reportConversation(user.sub, conversationId, body);
  }

  @Post("moderation/conversations/:conversationId/block")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  blockConversation(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
  ) {
    return this.moderationService.blockConversationPeer(user.sub, conversationId);
  }

  @Post("moderation/peers/:peerId/report")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  reportPeer(
    @CurrentUser() user: JwtPayload,
    @Param("peerId") peerId: string,
    @Body() body: unknown,
  ) {
    return this.moderationService.reportPeer(user.sub, peerId, body);
  }

  @Post("moderation/peers/:peerId/block")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  blockPeer(@CurrentUser() user: JwtPayload, @Param("peerId") peerId: string) {
    return this.moderationService.blockPeer(user.sub, peerId);
  }
}
