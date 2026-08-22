import { createDb, type Db } from "@kit/db";
import { Global, Module } from "@nestjs/common";

export const DB = Symbol("DB");
export type DbToken = Db;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Db => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error("DATABASE_URL is required");
        }
        return createDb(url).db;
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
