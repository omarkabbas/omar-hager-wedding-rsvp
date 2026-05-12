const YOUTUBE_HOST_PATTERN = /(^|\.)youtube(-nocookie)?\.com$|(^|\.)youtu\.be$/;

const cleanVideoId = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
};

const getYoutubeHost = (url: URL) => url.hostname.toLowerCase().replace(/^m\./, "").replace(/^www\./, "");

export const isYoutubeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    return YOUTUBE_HOST_PATTERN.test(getYoutubeHost(new URL(trimmed)));
  } catch {
    return false;
  }
};

export const toYoutubeEmbedUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const host = getYoutubeHost(url);
    if (!YOUTUBE_HOST_PATTERN.test(host)) return "";

    let videoId = "";
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      videoId = cleanVideoId(pathParts[0]);
    } else if (pathParts[0] === "watch") {
      videoId = cleanVideoId(url.searchParams.get("v"));
    } else if (["embed", "live", "shorts", "v"].includes(pathParts[0])) {
      videoId = cleanVideoId(pathParts[1]);
    }

    if (videoId) {
      const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
      const startSeconds = url.searchParams.get("start");
      if (startSeconds && /^\d+$/.test(startSeconds)) embedUrl.searchParams.set("start", startSeconds);
      return embedUrl.toString();
    }

    if (pathParts[0] === "live_stream") {
      const channelId = cleanVideoId(url.searchParams.get("channel"));
      if (channelId) return `https://www.youtube.com/embed/live_stream?channel=${channelId}`;
    }

    return "";
  } catch {
    return "";
  }
};
