import {
  adminClubIdParamSchema,
  adminClubSeasonParamsSchema,
  adminHonourIdParamSchema,
  adminKitIdParamSchema,
  adminKitPhotoParamsSchema,
  adminLeagueIdParamSchema,
  adminPlayerIdParamSchema,
  adminSeasonIdParamSchema,
  adminStamdataQuerySchema,
} from "@kit/api-contract";
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminCatalogService } from "./admin-catalog.service.js";

function sendPrivateBytes(reply: FastifyReply, bytes: Uint8Array, contentType: string) {
  return reply
    .header("cache-control", "private, max-age=3600")
    .type(contentType)
    .send(Buffer.from(bytes));
}

@Controller("admin/catalog")
@UseGuards(AdminAuthGuard)
export class AdminCatalogController {
  constructor(private readonly adminCatalogService: AdminCatalogService) {}

  @Get("stamdata")
  listStamdata(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = adminStamdataQuerySchema.safeParse({
      q: typeof query.q === "string" ? query.q : undefined,
      entityType: typeof query.entityType === "string" ? query.entityType : undefined,
      countryIds: query.countryIds ?? query.countryId,
      leagueIds: query.leagueIds ?? query.leagueId,
      seasonId: typeof query.seasonId === "string" ? query.seasonId : undefined,
      kitType: typeof query.kitType === "string" ? query.kitType : undefined,
      hasPhoto: typeof query.hasPhoto === "string" ? query.hasPhoto : undefined,
      limit: typeof query.limit === "string" ? query.limit : undefined,
      offset: typeof query.offset === "string" ? query.offset : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid stamdata query");
    }
    return this.adminCatalogService.listStamdata(parsed.data);
  }

  @Get("filter-options")
  getFilterOptions() {
    return this.adminCatalogService.getFilterOptions();
  }

  @Get("kits/:kitId")
  getKitDrill(@Param() params: Record<string, string>) {
    const parsed = adminKitIdParamSchema.safeParse({ kitId: params.kitId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid kit id");
    }
    return this.adminCatalogService.getKitDrill(parsed.data.kitId);
  }

  @Get("kits/:kitId/photos/:photoId")
  async getKitPhotoById(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminKitPhotoParamsSchema.safeParse({
      kitId: params.kitId,
      photoId: params.photoId,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid kit photo");
    }
    const { bytes, contentType } = await this.adminCatalogService.getKitPhotoBytes(
      parsed.data.kitId,
      parsed.data.photoId,
    );
    return sendPrivateBytes(reply, bytes, contentType);
  }

  @Get("kits/:kitId/photo")
  async getKitPhoto(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminKitIdParamSchema.safeParse({ kitId: params.kitId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid kit id");
    }
    const { bytes, contentType } = await this.adminCatalogService.getKitPhotoBytes(
      parsed.data.kitId,
    );
    return sendPrivateBytes(reply, bytes, contentType);
  }

  @Get("club-seasons/:clubId/:seasonId")
  getClubSeasonDrill(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    const parsed = adminClubSeasonParamsSchema.safeParse({
      clubId: params.clubId,
      seasonId: params.seasonId,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid club season");
    }
    const expand = query.expand === "true";
    return this.adminCatalogService.getClubSeasonDrill(
      parsed.data.clubId,
      parsed.data.seasonId,
      expand,
    );
  }

  @Post("clubs/:clubId/seasons/:seasonId/kits/fetch")
  @HttpCode(200)
  fetchClubSeasonKits(@Param() params: Record<string, string>) {
    const parsed = adminClubSeasonParamsSchema.safeParse({
      clubId: params.clubId,
      seasonId: params.seasonId,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid club season");
    }
    return this.adminCatalogService.fetchClubSeasonKits(parsed.data.clubId, parsed.data.seasonId);
  }

  @Get("clubs/:clubId/mark")
  async getClubMark(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminClubIdParamSchema.safeParse({ clubId: params.clubId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid club id");
    }
    const { bytes, contentType } = await this.adminCatalogService.getCatalogMarkBytes(
      "club",
      parsed.data.clubId,
    );
    return sendPrivateBytes(reply, bytes, contentType);
  }

  @Get("leagues/:leagueId/mark")
  async getLeagueMark(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminLeagueIdParamSchema.safeParse({ leagueId: params.leagueId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid league id");
    }
    const { bytes, contentType } = await this.adminCatalogService.getCatalogMarkBytes(
      "league",
      parsed.data.leagueId,
    );
    return sendPrivateBytes(reply, bytes, contentType);
  }

  @Get("honours/:honourId/mark")
  async getHonourMark(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminHonourIdParamSchema.safeParse({ honourId: params.honourId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid honour id");
    }
    const { bytes, contentType } = await this.adminCatalogService.getCatalogMarkBytes(
      "honour",
      parsed.data.honourId,
    );
    return sendPrivateBytes(reply, bytes, contentType);
  }

  @Get("players/:playerId/photo")
  async getPlayerPhoto(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminPlayerIdParamSchema.safeParse({ playerId: params.playerId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid player id");
    }
    const { bytes, contentType } = await this.adminCatalogService.getPlayerPhotoBytes(
      parsed.data.playerId,
    );
    return sendPrivateBytes(reply, bytes, contentType);
  }

  @Get("leagues/:leagueId")
  getLeagueDrill(@Param() params: Record<string, string>) {
    const parsed = adminLeagueIdParamSchema.safeParse({ leagueId: params.leagueId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid league id");
    }
    return this.adminCatalogService.getLeagueDrill(parsed.data.leagueId);
  }

  @Get("players/:playerId")
  getPlayerDrill(@Param() params: Record<string, string>) {
    const parsed = adminPlayerIdParamSchema.safeParse({ playerId: params.playerId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid player id");
    }
    return this.adminCatalogService.getPlayerDrill(parsed.data.playerId);
  }

  @Get("clubs/:clubId")
  getClubDrill(@Param() params: Record<string, string>) {
    const parsed = adminClubIdParamSchema.safeParse({ clubId: params.clubId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid club id");
    }
    return this.adminCatalogService.getClubDrill(parsed.data.clubId);
  }

  @Get("seasons/:seasonId")
  getSeasonDrill(@Param() params: Record<string, string>) {
    const parsed = adminSeasonIdParamSchema.safeParse({ seasonId: params.seasonId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid season id");
    }
    return this.adminCatalogService.getSeasonDrill(parsed.data.seasonId);
  }
}
