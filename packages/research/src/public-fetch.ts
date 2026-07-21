import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ResearchError, type RetrievedPage } from "./types";

function isPrivateIp(address: string): boolean {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:"))
    return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function assertPublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ResearchError("FETCH_BLOCKED", "Only public HTTP(S) pages may be retrieved.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new ResearchError("FETCH_BLOCKED", "Private network destinations are blocked.");
  }
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname))
      throw new ResearchError("FETCH_BLOCKED", "Private network destinations are blocked.");
  } else {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
      throw new ResearchError("FETCH_BLOCKED", "Private network destinations are blocked.");
    }
  }
  return url;
}

function decodeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPublicPage(value: string): Promise<RetrievedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    let url = await assertPublicUrl(value);
    let response: Response | undefined;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      try {
        response = await fetch(url, {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: "text/html,text/plain,application/xhtml+xml",
            "User-Agent": "MarlowResearchBot/1.0 (+public-web-research)",
          },
        });
      } catch (error) {
        if (error instanceof ResearchError) throw error;
        throw new ResearchError(
          "SEARCH_UNAVAILABLE",
          controller.signal.aborted
            ? "Public page retrieval timed out."
            : "Public page could not be retrieved.",
          true,
        );
      }

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location)
        throw new ResearchError("SEARCH_UNAVAILABLE", "Public page redirect was incomplete.");
      if (redirects === 5)
        throw new ResearchError("FETCH_BLOCKED", "Public page exceeded the redirect limit.");
      url = await assertPublicUrl(new URL(location, url).toString());
    }

    if (!response)
      throw new ResearchError("SEARCH_UNAVAILABLE", "Public page could not be retrieved.", true);
    if (!response.ok)
      throw new ResearchError(
        "SEARCH_UNAVAILABLE",
        `Public page returned HTTP ${response.status}.`,
        response.status >= 500,
      );
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!new Set(["text/html", "text/plain", "application/xhtml+xml"]).has(contentType)) {
      throw new ResearchError("FETCH_BLOCKED", "Unsupported public-page content type.");
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 1_000_000)
      throw new ResearchError("FETCH_BLOCKED", "Public page exceeds the retrieval size limit.");
    const raw = (await response.text()).slice(0, 1_000_000);
    const title =
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1]?.replace(/\s+/g, " ").trim() ??
      url.hostname;
    return {
      url: url.toString(),
      title,
      text: contentType === "text/plain" ? raw.trim() : decodeHtml(raw),
      retrievedAt: new Date().toISOString(),
      contentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}
