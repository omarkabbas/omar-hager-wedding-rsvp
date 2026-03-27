import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Prevents Vercel from caching old photos

export async function GET() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/'`,
      fields: 'files(id, name, thumbnailLink, webContentLink)',
      orderBy: 'createdTime desc', // Shows the newest uploads at the top
    });

    return NextResponse.json(response.data.files || []);
  } catch (error) {
    console.error("Fetch Photos Error:", error);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}