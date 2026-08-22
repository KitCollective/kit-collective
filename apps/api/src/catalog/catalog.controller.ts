import {
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
  catalogPickerClubIdParamSchema,
  catalogPickerSearchQuerySchema,
} from "@kit/api-contract";
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { CatalogService } from "./catalog.service.js";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("stats")
  getStats() {
    return this.catalogService.getStats();
  }

  @Get("peek")
  @Header("Content-Type", "text/html; charset=utf-8")
  getPeek() {
    return this.catalogService.getPeekHtml();
  }

  @Get("clubs/search")
  @UseGuards(JwtAuthGuard)
  async searchClubs(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = catalogPickerSearchQuerySchema.parse({
      q: typeof query.q === "string" ? query.q : undefined,
      locale: typeof query.locale === "string" ? query.locale : undefined,
    });
    const body = await this.catalogService.searchClubs(parsed.q, parsed.locale);
    return catalogClubSearchResponseSchema.parse(body);
  }

  @Get("clubs/:clubId/seasons")
  @UseGuards(JwtAuthGuard)
  async getClubSeasons(@Param("clubId") clubId: string) {
    const parsed = catalogPickerClubIdParamSchema.safeParse({ clubId });
    if (!parsed.success) {
      throw new BadRequestException("Invalid club id");
    }
    const body = await this.catalogService.getClubSeasons(parsed.data.clubId);
    return catalogClubSeasonsResponseSchema.parse(body);
  }
}
