import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { collectionJerseysSchema } from "@kit/api-contract";
import { CurrentUser } from "./current-user.decorator.js";
import { IdentityService, type JwtPayload } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post("identity/register")
  register(@Body() body: unknown) {
    return this.identityService.register(body);
  }

  @Post("identity/login")
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.identityService.login(body);
  }

  @Get("identity/me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.identityService.getMe(user.sub);
  }

  @Get("collection/jerseys")
  @UseGuards(JwtAuthGuard)
  listJerseys() {
    return collectionJerseysSchema.parse({ jerseys: [] });
  }
}
