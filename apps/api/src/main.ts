import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { isCorsOriginAllowed } from "./config/cors-origins.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin));
    },
    credentials: true,
  });

  app.setGlobalPrefix("v1");
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

bootstrap();
