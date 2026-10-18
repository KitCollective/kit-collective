import {
  type VisionGroupingSuggestRequest,
  type VisionJobResponse,
  type VisionLogResponse,
  type VisionSuggestResponse,
  visionGroupingSuggestRequestSchema,
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
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { BillingService } from "../billing/billing.service.js";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { AnonymousVisionUserService } from "./anonymous-vision-user.service.js";
import {
  decodeBase64Photo,
  identityPhotosFromSuggestRequest,
} from "./identity-photos-from-suggest.js";
import { UnsignedVisionThrottleService } from "./unsigned-vision-throttle.service.js";
import { VisionService } from "./vision.service.js";
import { VisionQueueService } from "./vision-queue.service.js";

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

const SUGGEST_FAILURE_DETAIL_MAX = 200;

/** The paywall code of a refusal from BillingService, or null for any other error. */
function paywallCode(error: unknown): string | null {
  if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.PAYMENT_REQUIRED) {
    return null;
  }
  const response = error.getResponse();
  if (typeof response === "object" && response !== null && "code" in response) {
    return typeof response.code === "string" ? response.code : null;
  }
  return null;
}

/** A short, byte-free name for why a suggest failed: never the body, photos or token. */
function describeSuggestFailure(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") {
    return "invalid request";
  }
  if (error instanceof HttpException) {
    return `${error.getStatus()} ${error.name}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, SUGGEST_FAILURE_DETAIL_MAX);
  }
  return "unknown error";
}

@Controller()
export class VisionController {
  private readonly logger = new Logger(VisionController.name);

  constructor(
    private readonly visionService: VisionService,
    private readonly visionQueueService: VisionQueueService,
    private readonly anonymousVisionUserService: AnonymousVisionUserService,
    private readonly unsignedVisionThrottleService: UnsignedVisionThrottleService,
    private readonly billingService: BillingService,
  ) {}

  @Post("collection/vision/suggest")
  @HttpCode(202)
  @UseGuards(JwtAuthGuard)
  async suggest(
    @CurrentUser() user: JwtPayload,
    @Body() rawBody: unknown,
  ): Promise<VisionSuggestResponse> {
    // One line per outcome (KIT-421), so a run log tells a refusal or an error from a
    // read that never arrived. Only ids, the photo count and an error name.
    let draft = "unknown";
    try {
      const body = visionSuggestRequestSchema.parse(rawBody);
      draft = body.draftId ?? "none";
      this.logger.log(
        `identity suggest received, draft ${draft}, user ${user.sub}, ${body.photos.length} photo(s)`,
      );
      await this.billingService.assertIdentityVisionAllowed(user.sub, body.draftId);
      const identityPhotos = identityPhotosFromSuggestRequest(body.photos);
      const jobId = await this.visionService.createJob(user.sub, { draftId: body.draftId });

      this.visionQueueService.enqueue({
        jobId,
        userId: user.sub,
        kind: "identity",
        draftId: body.draftId,
        identityPhotos,
      });

      this.logger.log(`identity suggest job ${jobId} started, draft ${draft}`);
      return visionSuggestResponseSchema.parse({ jobId });
    } catch (error) {
      const refusal = paywallCode(error);
      if (refusal) {
        this.logger.warn(`identity suggest refused ${refusal}, draft ${draft}, user ${user.sub}`);
      } else {
        this.logger.warn(
          `identity suggest failed, draft ${draft}: ${describeSuggestFailure(error)}`,
        );
      }
      throw error;
    }
  }

  @Post("collection/vision/suggest/unsigned")
  @HttpCode(202)
  async suggestUnsigned(
    @Req() request: FastifyRequest,
    @Body() rawBody: unknown,
  ): Promise<VisionSuggestResponse> {
    this.unsignedVisionThrottleService.assertWithinCap(request);

    const body = visionSuggestRequestSchema.parse(rawBody);
    const identityPhotos = identityPhotosFromSuggestRequest(body.photos);
    const userId = await this.anonymousVisionUserService.getUserId();
    const jobId = await this.visionService.createJob(userId, { draftId: body.draftId });

    this.visionQueueService.enqueue({
      jobId,
      userId,
      kind: "identity",
      draftId: body.draftId,
      identityPhotos,
    });

    return visionSuggestResponseSchema.parse({ jobId });
  }

  @Post("collection/vision/grouping/suggest")
  @HttpCode(202)
  @UseGuards(JwtAuthGuard)
  async suggestGrouping(
    @CurrentUser() user: JwtPayload,
    @Body() rawBody: unknown,
  ): Promise<VisionSuggestResponse> {
    const body: VisionGroupingSuggestRequest = visionGroupingSuggestRequestSchema.parse(rawBody);
    const groupingPhotos = body.photos.map((photo) => ({
      photoId: photo.photoId,
      bytes: decodeBase64Photo(photo.contentBase64),
    }));
    const jobId = await this.visionService.createJob(user.sub, {
      kind: "grouping",
      sessionId: body.sessionId,
    });

    this.visionQueueService.enqueue({
      jobId,
      userId: user.sub,
      kind: "grouping",
      sessionId: body.sessionId,
      groupingPhotos,
      groupingPriorGroups: body.priorGroups,
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

  @Get("collection/vision/jobs/:jobId/unsigned")
  async getJobUnsigned(
    @Param("jobId") jobId: string,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<VisionJobResponse> {
    const userId = await this.anonymousVisionUserService.getUserId();
    const job = await this.visionService.getJob(userId, jobId, resolveLocale(acceptLanguage));
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
