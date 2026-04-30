import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@rta/database";
import { AppError } from "./errors.js";

function buildS3() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? ""
    },
    forcePathStyle: true,
    region: "us-east-1"
  });
}

export class ImageService {
  private s3 = buildS3();

  async uploadFile(buffer: Buffer, key: string, contentType = "image/png") {
    const bucket = process.env.S3_BUCKET;
    const publicUrl = process.env.S3_PUBLIC_URL;
    if (!bucket || !publicUrl) {
      throw new AppError("S3 not configured", 500);
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType
      })
    );

    const url = `${publicUrl}/${key}`;
    await prisma.imageAsset.create({
      data: {
        key,
        url
      }
    });

    return url;
  }

  async uploadFromUrl(imageUrl: string, key: string) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new AppError("Failed to download source image", 400);
    }

    const arr = await response.arrayBuffer();
    const buffer = Buffer.from(arr);
    return this.uploadFile(buffer, key, response.headers.get("content-type") ?? "image/png");
  }

  async deleteImage(key: string) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new AppError("S3 bucket missing", 500);
    }

    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await prisma.imageAsset.delete({ where: { key } });
  }
}
