import type { LabelLocale } from "@kit/domain";
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { CollectionService } from "./collection.service.js";

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
  constructor(private readonly collectionService: CollectionService) {}

  @Get("collection/jerseys")
  @UseGuards(JwtAuthGuard)
  listJerseys(
    @CurrentUser() user: JwtPayload,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.listJerseys(user.sub, resolveLocale(acceptLanguage));
  }

  @Post("collection/jerseys/save")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  saveJersey(
    @CurrentUser() user: JwtPayload,
    @Req() request: FastifyRequest,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.collectionService.saveJersey(user.sub, request.body, resolveLocale(acceptLanguage));
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
