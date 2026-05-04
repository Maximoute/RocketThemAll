import { prisma } from "@rta/database";
import { ImageService } from "./image.service.js";

export class ImportService {
  private imageService = new ImageService();

  async createImportJob(sourceUrl: string, imageCredit?: string) {
    return prisma.importJob.create({
      data: {
        sourceUrl,
        imageCredit,
        status: "pending"
      }
    });
  }

  async processImportJob(jobId: string) {
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const key = `imports/${job.id}.png`;

    await prisma.importJob.update({ where: { id: jobId }, data: { status: "downloaded" } });

    try {
      const url = await this.imageService.uploadFromUrl(job.sourceUrl, key);
      const asset = await prisma.imageAsset.update({
        where: { key },
        data: {
          sourceUrl: job.sourceUrl,
          imageCredit: job.imageCredit
        }
      });

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: "uploaded",
          imageAssetId: asset.id
        }
      });

      return { url, assetId: asset.id };
    } catch (error) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "unknown error"
        }
      });
      throw error;
    }
  }

  async setJobDecision(jobId: string, approved: boolean) {
    return prisma.importJob.update({
      where: { id: jobId },
      data: { status: approved ? "approved" : "rejected" }
    });
  }
}
