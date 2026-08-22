import { Controller, Get, Header } from "@nestjs/common";
import type { CatalogService } from "./catalog.service.js";

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
}
