import { collectionJerseysSchema } from "@kit/api-contract";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";

@Controller()
export class CollectionController {
  @Get("collection/jerseys")
  @UseGuards(JwtAuthGuard)
  listJerseys() {
    return collectionJerseysSchema.parse({ jerseys: [] });
  }
}
