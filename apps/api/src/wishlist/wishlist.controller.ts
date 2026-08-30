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
  UseGuards,
} from "@nestjs/common";
import { LiveEntitlementGuard } from "../billing/live-entitlement.guard.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { WishlistService } from "./wishlist.service.js";

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
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get("wishlist/entries")
  @UseGuards(JwtAuthGuard)
  listEntries(
    @CurrentUser() user: JwtPayload,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.wishlistService.listEntries(user.sub, resolveLocale(acceptLanguage));
  }

  @Post("wishlist/entries")
  @UseGuards(JwtAuthGuard, LiveEntitlementGuard)
  createEntry(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.wishlistService.createEntry(user.sub, body, resolveLocale(acceptLanguage));
  }

  @Patch("wishlist/entries/:entryId")
  @UseGuards(JwtAuthGuard, LiveEntitlementGuard)
  updateEntry(
    @CurrentUser() user: JwtPayload,
    @Param("entryId") entryId: string,
    @Body() body: unknown,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.wishlistService.updateEntry(user.sub, entryId, body, resolveLocale(acceptLanguage));
  }

  @Delete("wishlist/entries/:entryId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  deleteEntry(@CurrentUser() user: JwtPayload, @Param("entryId") entryId: string) {
    return this.wishlistService.deleteEntry(user.sub, entryId);
  }
}
