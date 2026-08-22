import {
  type VisionJobResponse,
  type VisionLogResponse,
  type VisionSuggestResponse,
  visionJobResponseSchema,
  visionLogRequestSchema,
  visionLogResponseSchema,
  visionSuggestRequestSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import type { LabelLocale } from "@kit/domain";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { VisionService } from "./vision.service.js";
import { VisionQueueService } from "./vision-queue.service.js";

function decodeBase64Photo(contentBase64: string): Uint8Array {
  const commaIndex = contentBase64.indexOf(",");
  const normalized = commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new Error("Photo bytes are empty");
  }
  return Uint8Array.from(bytes);
}

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
export class VisionController {
  constructor(
    private readonly visionService: VisionService,
    private readonly visionQueueService: VisionQueueService,
  ) {}

  @Post("collection/vision/suggest")
  @HttpCode(202)
  @UseGuards(JwtAuthGuard)
  async suggest(
    @CurrentUser() user: JwtPayload,
    @Body() rawBody: unknown,
  ): Promise<VisionSuggestResponse> {
    const body = visionSuggestRequestSchema.parse(rawBody);
    const photoBytes = decodeBase64Photo(body.photo.contentBase64);
    const jobId = await this.visionService.createJob(user.sub, photoBytes, body.draftId);

    this.visionQueueService.enqueue({
      jobId,
      userId: user.sub,
      draftId: body.draftId,
      photoBytes,
    });

    return visionSuggestResponseSchema.parse({ jobId });
  }

  @Get("collection/vision/jobs/:jobId")
  @UseGuards(JwtAuthGuard)
  async getJob(
    @CurrentUser() user: JwtPayload,
    @Param("jobId") jobId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<VisionJobResponse> {
    const job = await this.visionService.getJob(user.sub, jobId, resolveLocale(acceptLanguage));
    if (!job) {
      throw new NotFoundException("Vision job not found");
    }

    return visionJobResponseSchema.parse(job);
  }

  @Post("collection/vision/log")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logAction(
    @CurrentUser() user: JwtPayload,
    @Body() rawBody: unknown,
  ): Promise<VisionLogResponse> {
    const body = visionLogRequestSchema.parse(rawBody);
    const logged = await this.visionService.logUserAction(
      user.sub,
      body.jobId,
      body.action,
      body.userJerseyId,
    );

    if (!logged) {
      throw new NotFoundException("Vision job not found");
    }

    return visionLogResponseSchema.parse({ logged: true });
  }
}
