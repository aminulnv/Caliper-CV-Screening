import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET!;

export interface StorageService {
  upload(path: string, buffer: Buffer, mimeType: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  remove(path: string): Promise<void>;
}

export const storage: StorageService = {
  async upload(path, buffer, mimeType) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: path,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
    }));
    return path;
  },

  async download(path) {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: path }));
    if (!res.Body) throw new Error('Empty response from S3');
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  },

  async remove(path) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: path }));
  },
};
