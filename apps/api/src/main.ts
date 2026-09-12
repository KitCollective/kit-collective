import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { FK_LISTING_INGEST_TIMEOUT_MS } from "./admin/fk-listing-ingest.js";
import { isCorsOriginAllowed } from "./config/cors-origins.js";
import { apiListenHost } from "./config/listen-host.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin));
    },
    credentials: true,
  });
  app.setGlobalPrefix("v1");
  const port = Number(process.env.PORT ?? 3000);
  const host = apiListenHost();
  await app.listen({
    port,
    host,
    ...(host === "::" ? { ipv6Only: false } : {}),
  });
  const httpServer = app.getHttpServer();
  httpServer.requestTimeout = FK_LISTING_INGEST_TIMEOUT_MS;
  httpServer.headersTimeout = FK_LISTING_INGEST_TIMEOUT_MS;
}

bootstrap();
