import { useEffect, useRef, useState } from "react";

import {
  File as FileIcon,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
} from "lucide-react";

import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { fileExtensionLabel, fileKind, fileSrc, thumbnailKind } from "./logic";
import type { FileEntry, FileKind } from "./types";

const KIND_ICONS: Record<FileKind, typeof FileIcon> = {
  image: ImageIcon,
  pdf: FileText,
  audio: Music,
  video: Film,
  other: FileIcon,
};

/** Load a little before a tile scrolls into view, so previews are ready when it arrives. */
const LOAD_MARGIN = "200px";
/** Show a frame from just past the start, which is more often a real picture than a black fade-in. */
const VIDEO_POSTER_FRAGMENT = "#t=0.1";

/**
 * A tile's picture. A preview decrypts its file, so it exists only while its tile is near the viewport:
 * a large library costs what's on screen, not what's stored. Anything without a preview, or whose
 * preview fails to load, shows its kind's icon and file extension.
 */
export function FileThumbnail({ file }: { file: FileEntry }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [failed, setFailed] = useState(false);
  const kind = failed ? null : thumbnailKind(file);

  useEffect(() => {
    if (!kind) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: LOAD_MARGIN },
    );
    observer.observe(containerRef.current!);
    return () => observer.disconnect();
  }, [kind]);

  const Icon = KIND_ICONS[fileKind(file.mime)];
  const src = fileSrc(file);
  const markFailed = () => setFailed(true);

  return (
    <>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center overflow-hidden",
          file.invalid && "opacity-40 grayscale",
        )}
        ref={containerRef}
      >
        {!kind ? (
          <div className="flex min-w-0 max-w-full flex-col items-center gap-1.5 px-3 text-muted-foreground">
            <Icon className="h-10 w-10 shrink-0" />
            <span className="max-w-full truncate text-xs font-medium tracking-wide">
              {fileExtensionLabel(file.fileName)}
            </span>
          </div>
        ) : !nearViewport ? null : kind === "image" ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            onError={markFailed}
            src={src}
          />
        ) : kind === "video" ? (
          <video
            aria-hidden="true"
            className="h-full w-full object-cover"
            muted
            onError={markFailed}
            playsInline
            preload="metadata"
            src={`${src}${VIDEO_POSTER_FRAGMENT}`}
            tabIndex={-1}
          />
        ) : (
          <iframe
            aria-hidden="true"
            // Oversized so the reader's scrollbars fall outside the tile and are clipped; a tile is a
            // picture, so the reader must not react to the pointer either.
            className="pointer-events-none absolute left-0 top-0 h-[calc(100%+1rem)] w-[calc(100%+1rem)] max-w-none bg-white"
            src={src}
            tabIndex={-1}
            title={file.title}
          />
        )}
      </div>
      {file.invalid ? <InvalidStamp /> : null}
    </>
  );
}

/** Rubber-stamped across a preview, so an invalid file can't be mistaken for a current one. */
function InvalidStamp() {
  const { t } = useT();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="-rotate-12 rounded border-2 border-red-500 bg-black/50 px-3 py-1 text-base font-extrabold uppercase tracking-widest text-red-400">
        {t("files.invalid")}
      </span>
    </div>
  );
}
