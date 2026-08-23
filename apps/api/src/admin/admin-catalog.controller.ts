import {
  adminClubIdParamSchema,
  adminClubSeasonParamsSchema,
  adminKitIdParamSchema,
  adminSeasonIdParamSchema,
  adminStamdataQuerySchema,
} from "@kit/api-contract";
import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminCatalogService } from "./admin-catalog.service.js";

@Controller("admin/catalog")
@UseGuards(AdminAuthGuard)
export class AdminCatalogController {
  constructor(private readonly adminCatalogService: AdminCatalogService) {}

  @Get("stamdata")
  listStamdata(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = adminStamdataQuerySchema.safeParse({
      q: typeof query.q === "string" ? query.q : undefined,
      countryId: typeof query.countryId === "string" ? query.countryId : undefined,
      leagueId: typeof query.leagueId === "string" ? query.leagueId : undefined,
      seasonId: typeof query.seasonId === "string" ? query.seasonId : undefined,
      kitType: typeof query.kitType === "string" ? query.kitType : undefined,
      hasPhoto: typeof query.hasPhoto === "string" ? query.hasPhoto : undefined,
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

  @Get("kits/:kitId/photo")
  async getKitPhoto(@Param() params: Record<string, string>, @Res() reply: FastifyReply) {
    const parsed = adminKitIdParamSchema.safeParse({ kitId: params.kitId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid kit id");
    }
    const { bytes, contentType } = await this.adminCatalogService.getKitPhotoBytes(
      parsed.data.kitId,
    );
    return reply.type(contentType).send(Buffer.from(bytes));
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
