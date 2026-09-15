import { adminVisionLabelQuerySchema } from "@kit/api-contract";
import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
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
}
