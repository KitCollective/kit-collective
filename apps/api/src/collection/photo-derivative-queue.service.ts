import { Injectable } from "@nestjs/common";
import type { ObjectStoreAdapter } from "./object-store.js";
import { type PhotoDerivativeJob, processPhotoDerivativeJob } from "./photo-derivatives.js";

@Injectable()
export class PhotoDerivativeQueueService {
  enqueue(objectStore: ObjectStoreAdapter, job: PhotoDerivativeJob): void {
    setImmediate(() => {
      void processPhotoDerivativeJob(objectStore, job).catch(() => {
        // Derivatives are fail-open — Save must not wait on strip/lightbox.
      });
    });
  }
}
