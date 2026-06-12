import { NextResponse } from 'next/server';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import Busboy from 'busboy';
import { Readable } from 'stream';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { r2Client, isValidApiKey } from '@/lib/r2/client';
import { uuidPrefixedFilename } from '@/lib/r2/keys';

export { r2Client, isValidApiKey };

const SCOPE = {
  bucket: process.env.R2_BUCKET_NAME,
  rootPrefix: 'uploads',
  publicBase: process.env.R2_PUBLIC_BASE_URL || 'https://storage.procd.cc',
};

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session && !isValidApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await r2Client.send(new ListObjectsV2Command({ Bucket: SCOPE.bucket, Prefix: `${SCOPE.rootPrefix}/` }));
    const files = (result.Contents || [])
      .filter((f) => !f.Key.endsWith('/.keep'))
      .map((file) => ({
        key: file.Key,
        url: `${SCOPE.publicBase}/${file.Key}`,
        size: file.Size,
        lastModified: file.LastModified,
      }));
    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error listing files:', error);
    return new NextResponse('Failed to list files', { status: 500 });
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session && !isValidApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') || '';
  const busboy = Busboy({ headers: { 'content-type': contentType } });
  const filesData = [];
  const uploadPromises = [];

  return new Promise((resolve, reject) => {
    busboy.on('file', (fieldname, file, fileData) => {
      const { filename, mimeType } = fileData;
      const MAX_FILE_SIZE = 100 * 1024 * 1024;
      let fileSize = 0;
      const chunks = [];

      file.on('data', (chunk) => {
        fileSize += chunk.length;
        if (fileSize > MAX_FILE_SIZE) {
          file.unpipe();
          file.resume();
          return reject(new NextResponse(`File "${filename}" exceeds 100MB limit.`, { status: 413 }));
        }
        chunks.push(chunk);
      });

      file.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const key = `${SCOPE.rootPrefix}/${uuidPrefixedFilename(filename)}`;
        const command = new PutObjectCommand({
          Bucket: SCOPE.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ACL: 'public-read',
        });
        const p = r2Client.send(command).then(() => {
          filesData.push({ key, url: `${SCOPE.publicBase}/${key}` });
        });
        uploadPromises.push(p);
      });

      file.on('error', (err) => {
        console.error('File stream error:', err);
        reject(new NextResponse('File stream error', { status: 500 }));
      });
    });

    busboy.on('error', (err) => {
      console.error('Busboy error:', err);
      reject(new NextResponse('Parsing error', { status: 500 }));
    });

    busboy.on('finish', async () => {
      try {
        await Promise.all(uploadPromises);
        resolve(NextResponse.json({ message: 'Upload complete', files: filesData }));
      } catch (err) {
        console.error('Error awaiting uploads:', err);
        reject(new NextResponse('Upload processing failed', { status: 500 }));
      }
    });

    Readable.from(req.body).pipe(busboy);
  });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session && !isValidApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { key } = await req.json();
  if (!key) return NextResponse.json({ error: 'File key is required' }, { status: 400 });

  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: SCOPE.bucket, Key: key }));
    return NextResponse.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    return new NextResponse('Failed to delete file', { status: 500 });
  }
}
