import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// Temporary memory for upload sessions
const uploadSessions = new Map<string, string>();

export async function POST(req: Request) {
  try {
    const { fileId, fileName, fileType, chunkIndex, totalChunks, totalSize, data } = await req.json();
    const buffer = Buffer.from(data, 'base64');

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const accessToken = (await auth.getAccessToken()).token;

    let sessionUrl = uploadSessions.get(fileId);

    // 1. FIRST CHUNK: Get the Session URL
    if (chunkIndex === 0) {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': fileType,
          'X-Upload-Content-Length': totalSize.toString(),
        },
        body: JSON.stringify({
          name: fileName,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        }),
      });
      sessionUrl = response.headers.get('Location')!;
      uploadSessions.set(fileId, sessionUrl);
    }

    // 2. SEND CHUNK: This uses PUT
    const start = chunkIndex * (1024 * 1024);
    const end = start + buffer.length - 1;

    const uploadRes = await fetch(sessionUrl!, {
      method: 'PUT',
      headers: {
        'Content-Length': buffer.length.toString(),
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      },
      body: buffer,
    });

    // 3. CLEANUP
    if (chunkIndex === totalChunks - 1) {
      uploadSessions.delete(fileId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}