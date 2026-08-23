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

  @Get("collection/jerseys")
  @UseGuards(JwtAuthGuard)
  listJerseys(
    @CurrentUser() user: JwtPayload,
    @Query("shortcutId") shortcutId?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.listJerseys(user.sub, resolveLocale(acceptLanguage), shortcutId);
  }

  @Get("collection/shortcuts")
  @UseGuards(JwtAuthGuard)
  listShortcuts(@CurrentUser() user: JwtPayload) {
    return this.shortcutsService.listShortcuts(user.sub);
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
