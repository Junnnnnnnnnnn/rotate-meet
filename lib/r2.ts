import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const publicBucket = process.env.CLOUDFLARE_R2_PUBLIC_BUCKET;
const privateBucket = process.env.CLOUDFLARE_R2_PRIVATE_BUCKET;
const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
if (!accessKeyId) throw new Error('CLOUDFLARE_R2_ACCESS_KEY_ID is not set');
if (!secretAccessKey) throw new Error('CLOUDFLARE_R2_SECRET_ACCESS_KEY is not set');
if (!publicBucket) throw new Error('CLOUDFLARE_R2_PUBLIC_BUCKET is not set');
if (!privateBucket) throw new Error('CLOUDFLARE_R2_PRIVATE_BUCKET is not set');
if (!publicBaseUrl) throw new Error('R2_PUBLIC_BASE_URL is not set');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

export async function uploadPublic(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: publicBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${publicBaseUrl}/${key}`;
}

export async function uploadPrivate(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: privateBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function deletePrivate(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: privateBucket,
      Key: key,
    }),
  );
}

export async function deletePublic(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: publicBucket,
      Key: key,
    }),
  );
}

export async function getPrivatePresignedUrl(
  key: string,
  ttlSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: privateBucket, Key: key }),
    { expiresIn: ttlSeconds },
  );
}
