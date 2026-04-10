import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    // Grab all files attached to the form
    const files = formData.getAll('file') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > 5) {
      return NextResponse.json({ error: "Maximum of 5 photos allowed at a time." }, { status: 400 });
    }

    // Authenticate securely
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const uploadedIds = [];

    // Loop through each file and upload it to Google Drive
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
    
      const response = await drive.files.create({
        requestBody: {
          name: `Guest_${Date.now()}_${file.name}`,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!], 
        },
        media: {
          mimeType: file.type,
          body: Readable.from(buffer),
        },
        fields: 'id',
      });
      
      if (response.data.id) {
        uploadedIds.push(response.data.id);
      }
    }

    return NextResponse.json({ success: true, ids: uploadedIds });
  } catch (error: unknown) {
    console.error("Drive Upload Error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
