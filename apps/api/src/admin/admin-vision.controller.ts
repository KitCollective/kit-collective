import {
  adminVisionImproveIdParamSchema,
  adminVisionImproveQuerySchema,
  adminVisionLabelQuerySchema,
} from "@kit/api-contract";
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminVisionService } from "./admin-vision.service.js";

@Controller("admin/vision")
@UseGuards(AdminAuthGuard)
export class AdminVisionController {
  constructor(private readonly adminVisionService: AdminVisionService) {}

  @Get("labels")
  listLabels(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = adminVisionLabelQuerySchema.safeParse({
      class: typeof query.class === "string" ? query.class : undefined,
      userAction: typeof query.userAction === "string" ? query.userAction : undefined,
      user_action: typeof query.user_action === "string" ? query.user_action : undefined,
      limit: typeof query.limit === "string" ? query.limit : undefined,
      offset: typeof query.offset === "string" ? query.offset : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid vision labels query");
    }
    return this.adminVisionService.listLabels(parsed.data);
  }

  @Get("improve")
  listImprove(@Query() query: Record<string, string | string[] | undefined>) {
    const parsed = adminVisionImproveQuerySchema.safeParse({
      status: typeof query.status === "string" ? query.status : undefined,
      limit: typeof query.limit === "string" ? query.limit : undefined,
      offset: typeof query.offset === "string" ? query.offset : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException("Invalid vision improve query");
    }
    return this.adminVisionService.listImprove(parsed.data);
  }

  @Post("improve/:id/apply")
  applyImprove(@Param() params: Record<string, string>) {
    const parsed = adminVisionImproveIdParamSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      throw new BadRequestException("Invalid vision improve id");
    }
    return this.adminVisionService.applyImprove(parsed.data.id);
  }

  @Post("improve/:id/dismiss")
  dismissImprove(@Param() params: Record<string, string>) {
    const parsed = adminVisionImproveIdParamSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      throw new BadRequestException("Invalid vision improve id");
    }
    return this.adminVisionService.dismissImprove(parsed.data.id);
  }
}
