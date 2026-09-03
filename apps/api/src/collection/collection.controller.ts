import type { LabelLocale } from "@kit/domain";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { CollectionService } from "./collection.service.js";
import { CollectionShortcutsService } from "./collection-shortcuts.service.js";

function resolveLocale(headerValue: string | undefined): LabelLocale {
  if (
    headerValue === "da" ||
    headerValue === "en" ||
    headerValue === "sv" ||
    headerValue === "no"
  ) {
    return headerValue;
  }
  return "da";
}

@Controller()
export class CollectionController {
  constructor(
    private readonly collectionService: CollectionService,
    private readonly shortcutsService: CollectionShortcutsService,
  ) {}

  @Get("collection/showcase/jerseys")
  showcaseJerseys(@Headers("accept-language") acceptLanguage?: string) {
    return this.collectionService.listShowcaseJerseys(resolveLocale(acceptLanguage));
  }

  @Get("collection/showcase/photos/:photoId")
  async getShowcasePhoto(@Param("photoId") photoId: string, @Res() reply: FastifyReply) {
    const bytes = await this.collectionService.getShowcasePhotoBytes(photoId);
    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(Buffer.from(bytes));
  }

  @Get("collection/jerseys")
  @UseGuards(JwtAuthGuard)
  listJerseys(
    @CurrentUser() user: JwtPayload,
    @Query("shortcutId") shortcutId?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.listJerseys(user.sub, resolveLocale(acceptLanguage), shortcutId);
  }

  @Get("collection/conversations")
  @UseGuards(JwtAuthGuard)
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.collectionService.listConversations(user.sub);
  }

  @Get("collection/activity")
  @UseGuards(JwtAuthGuard)
  listActivity(
    @CurrentUser() user: JwtPayload,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.listActivity(user.sub, resolveLocale(acceptLanguage));
  }

  @Get("collection/conversations/:conversationId")
  @UseGuards(JwtAuthGuard)
  getConversation(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.getConversationDetail(
      user.sub,
      conversationId,
      resolveLocale(acceptLanguage),
    );
  }

  @Get("collection/conversations/:conversationId/peer")
  @UseGuards(JwtAuthGuard)
  getConversationPeer(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
  ) {
    return this.collectionService.getConversationPeer(user.sub, conversationId);
  }

  @Delete("collection/conversations/:conversationId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async hideConversation(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
    @Res() reply: FastifyReply,
  ) {
    await this.collectionService.hideConversation(user.sub, conversationId);
    return reply.status(204).send();
  }

  @Post("collection/conversations/:conversationId/messages")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  sendConversationMessage(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: unknown,
  ) {
    return this.collectionService.sendConversationMessage(user.sub, conversationId, body);
  }

  @Patch("collection/conversations/:conversationId/messages/:messageId/bid")
  @UseGuards(JwtAuthGuard)
  respondBid(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() body: unknown,
  ) {
    return this.collectionService.respondBid(user.sub, conversationId, messageId, body);
  }

  @Get("collection/conversations/:conversationId/messages/:messageId/photo")
  @UseGuards(JwtAuthGuard)
  async getConversationMessagePhoto(
    @CurrentUser() user: JwtPayload,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Res() reply: FastifyReply,
  ) {
    const bytes = await this.collectionService.getConversationMessagePhotoBytes(
      user.sub,
      conversationId,
      messageId,
    );
    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(Buffer.from(bytes));
  }

  @Get("collection/discover/home")
  @UseGuards(JwtAuthGuard)
  discoverHome(
    @CurrentUser() user: JwtPayload,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.discoverHome(user.sub, resolveLocale(acceptLanguage));
  }

  @Get("collection/discover/clubs/:clubId")
  @UseGuards(JwtAuthGuard)
  discoverClubDrill(
    @CurrentUser() user: JwtPayload,
    @Param("clubId") clubId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.discoverCatalogDrill(
      user.sub,
      "club",
      clubId,
      resolveLocale(acceptLanguage),
    );
  }

  @Get("collection/discover/players/:playerId")
  @UseGuards(JwtAuthGuard)
  discoverPlayerDrill(
    @CurrentUser() user: JwtPayload,
    @Param("playerId") playerId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.discoverCatalogDrill(
      user.sub,
      "player",
      playerId,
      resolveLocale(acceptLanguage),
    );
  }

  @Get("collection/discover/kits/:kitId")
  @UseGuards(JwtAuthGuard)
  discoverKitDrill(
    @CurrentUser() user: JwtPayload,
    @Param("kitId") kitId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.discoverCatalogDrill(
      user.sub,
      "kit",
      kitId,
      resolveLocale(acceptLanguage),
    );
  }

  @Get("collection/discover/typeahead")
  @UseGuards(JwtAuthGuard)
  discoverTypeahead(
    @CurrentUser() user: JwtPayload,
    @Query("q") query?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.discoverTypeahead(user.sub, query, resolveLocale(acceptLanguage));
  }

  @Get("collection/discover/jerseys")
  @UseGuards(JwtAuthGuard)
  discoverJerseys(
    @CurrentUser() user: JwtPayload,
    @Query("q") query?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.discoverJerseys(user.sub, query, resolveLocale(acceptLanguage));
  }

  @Get("collection/jerseys/:jerseyId/peer")
  @UseGuards(JwtAuthGuard)
  getPeerJersey(
    @CurrentUser() user: JwtPayload,
    @Param("jerseyId") jerseyId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.getPeerJersey(user.sub, jerseyId, resolveLocale(acceptLanguage));
  }

  @Get("collection/peers/:peerId/jerseys")
  @UseGuards(JwtAuthGuard)
  listPeerJerseys(
    @CurrentUser() user: JwtPayload,
    @Param("peerId") peerId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.listPeerJerseys(user.sub, peerId, resolveLocale(acceptLanguage));
  }

  @Get("collection/favorites")
  @UseGuards(JwtAuthGuard)
  listFavorites(
    @CurrentUser() user: JwtPayload,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.listFavorites(user.sub, resolveLocale(acceptLanguage));
  }

  @Post("collection/favorites")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  addFavorite(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.collectionService.addFavorite(user.sub, body);
  }

  @Delete("collection/favorites/:userJerseyId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async removeFavorite(
    @CurrentUser() user: JwtPayload,
    @Param("userJerseyId") userJerseyId: string,
    @Res() reply: FastifyReply,
  ) {
    await this.collectionService.removeFavorite(user.sub, userJerseyId);
    return reply.status(204).send();
  }

  @Patch("collection/jerseys/:jerseyId/bidding")
  @UseGuards(JwtAuthGuard)
  patchBidding(
    @CurrentUser() user: JwtPayload,
    @Param("jerseyId") jerseyId: string,
    @Body() body: unknown,
  ) {
    return this.collectionService.patchBidding(user.sub, jerseyId, body);
  }

  @Patch("collection/jerseys/:jerseyId/private")
  @UseGuards(JwtAuthGuard)
  patchPrivate(
    @CurrentUser() user: JwtPayload,
    @Param("jerseyId") jerseyId: string,
    @Body() body: unknown,
  ) {
    return this.collectionService.patchPrivate(user.sub, jerseyId, body);
  }

  @Patch("collection/jerseys/:jerseyId")
  @UseGuards(JwtAuthGuard)
  updateJersey(
    @CurrentUser() user: JwtPayload,
    @Param("jerseyId") jerseyId: string,
    @Body() body: unknown,
  ) {
    return this.collectionService.updateJersey(user.sub, jerseyId, body);
  }

  @Delete("collection/jerseys/:jerseyId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteOwnJersey(
    @CurrentUser() user: JwtPayload,
    @Param("jerseyId") jerseyId: string,
    @Res() reply: FastifyReply,
  ) {
    await this.collectionService.deleteOwnJersey(user.sub, jerseyId);
    return reply.status(204).send();
  }

  @Post("collection/jerseys/:jerseyId/bids")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  sendBid(
    @CurrentUser() user: JwtPayload,
    @Param("jerseyId") jerseyId: string,
    @Body() body: unknown,
  ) {
    return this.collectionService.sendBid(user.sub, jerseyId, body);
  }

  @Get("collection/shortcuts")
  @UseGuards(JwtAuthGuard)
  listShortcuts(
    @CurrentUser() user: JwtPayload,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.shortcutsService.listShortcuts(user.sub, resolveLocale(acceptLanguage));
  }

  @Post("collection/shortcuts")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  createShortcut(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.shortcutsService.createShortcut(user.sub, body, resolveLocale(acceptLanguage));
  }

  @Patch("collection/shortcuts/:shortcutId")
  @UseGuards(JwtAuthGuard)
  updateShortcut(
    @CurrentUser() user: JwtPayload,
    @Param("shortcutId") shortcutId: string,
    @Body() body: unknown,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.shortcutsService.updateShortcut(
      user.sub,
      shortcutId,
      body,
      resolveLocale(acceptLanguage),
    );
  }

  @Put("collection/shortcuts/reorder")
  @UseGuards(JwtAuthGuard)
  reorderShortcuts(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.shortcutsService.reorderShortcuts(user.sub, body);
  }

  @Delete("collection/shortcuts/:shortcutId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteShortcut(
    @CurrentUser() user: JwtPayload,
    @Param("shortcutId") shortcutId: string,
    @Res() reply: FastifyReply,
  ) {
    await this.shortcutsService.deleteShortcut(user.sub, shortcutId);
    return reply.status(204).send();
  }

  @Post("collection/jerseys/save")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  saveJersey(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.saveJersey(user.sub, body, resolveLocale(acceptLanguage));
  }

  @Get("collection/photos/:photoId")
  @UseGuards(JwtAuthGuard)
  async getPhoto(
    @CurrentUser() user: JwtPayload,
    @Param("photoId") photoId: string,
    @Res() reply: FastifyReply,
  ) {
    const bytes = await this.collectionService.getPhotoBytes(user.sub, photoId);
    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(Buffer.from(bytes));
  }
}
