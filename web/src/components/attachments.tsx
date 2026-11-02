import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl, uploadAttachment, type Attachment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const ACCEPT = "image/*,application/pdf";
const MAX_SIDE = 2000;

/** Phone photos are 3-8 MB; receipts stay readable at 2000px JPEG and take ~10x less space. */
export async function shrinkImage(file: File): Promise<{ blob: Blob; name: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600_000) return { blob: file, name: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round(bitmap.width * scale),
      height: Math.round(bitmap.height * scale),
    });
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return { blob: file, name: file.name };
    return { blob, name: file.name.replace(/\.\w+$/, "") + ".jpg" };
  } catch {
    return { blob: file, name: file.name };
  }
}

export const uploadFile = async (target: { vehicle_id?: string; entry_id?: string }, file: File) => {
  const { blob, name } = await shrinkImage(file);
  return uploadAttachment(target, blob, name);
};

type Props =
  | { entryId: string; vehicleId?: undefined; pending?: undefined; onPendingChange?: undefined }
  | { vehicleId: string; entryId?: undefined; pending?: undefined; onPendingChange?: undefined }
  /** Before the entry exists: files are held here and uploaded by the form after it saves. */
  | { pending: File[]; onPendingChange: (files: File[]) => void; entryId?: undefined; vehicleId?: undefined };

/** Receipts on an entry, or documents (CRLV, insurance policy, manual) on a vehicle. */
export function Attachments(props: Props) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const target: Record<string, string> | null = props.entryId
    ? { entry_id: props.entryId }
    : props.vehicleId
      ? { vehicle_id: props.vehicleId }
      : null;
  const key = ["attachments", target];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api<Attachment[]>(`/attachments?${new URLSearchParams(target!)}`),
    enabled: !!target,
    // Vehicle documents are the ones not tied to a specific record.
    select: (rows) => (props.vehicleId ? rows.filter((a) => !a.entry_id) : rows),
  });
  const refresh = () => Promise.all(["attachments", "entries"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await uploadFile(target!, f);
    },
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/attachments/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  const pick = (files: File[]) => {
    if (!files.length) return;
    if (props.onPendingChange) props.onPendingChange([...props.pending, ...files]);
    else upload.mutate(files);
  };

  const tiles: { key: string; name: string; image?: string; onOpen?: () => void; href?: string; onRemove: () => void }[] =
    props.pending
      ? props.pending.map((f, i) => ({
          key: `${i}:${f.name}`,
          name: f.name,
          onRemove: () => props.onPendingChange(props.pending.filter((x) => x !== f)),
        }))
      : (list.data ?? []).map((a) => ({
          key: a.id,
          name: a.name,
          image: a.mime.startsWith("image/") ? fileUrl(a.id) : undefined,
          onOpen: a.mime.startsWith("image/") ? () => setViewing(a) : undefined,
          href: a.mime.startsWith("image/") ? undefined : fileUrl(a.id),
          onRemove: () => confirm(`Delete ${a.name}?`) && remove.mutate(a.id),
        }));

  return (
    <div className="space-y-3">
      {tiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {tiles.map((t) => {
            const body = t.image ? (
              <img src={t.image} alt={t.name} loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                <FileText className="size-6" />
                <span className="line-clamp-2 break-all">{t.name}</span>
              </span>
            );
            return (
              <div key={t.key} className="group relative aspect-square overflow-hidden rounded-xl border bg-secondary">
                {t.href ? (
                  <a href={t.href} target="_blank" rel="noreferrer" className="block size-full">{body}</a>
                ) : (
                  <button type="button" onClick={t.onOpen} className="block size-full">{body}</button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${t.name}`}
                  onClick={t.onRemove}
                  className="absolute top-1 right-1 rounded-full bg-background/80 p-1 text-foreground backdrop-blur"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={() => input.current?.click()} disabled={upload.isPending}>
        {upload.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />} Add photo or PDF
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          pick([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{viewing?.name}</DialogTitle>
          {viewing && (
            <a href={fileUrl(viewing.id)} target="_blank" rel="noreferrer">
              <img src={fileUrl(viewing.id)} alt={viewing.name} className="max-h-[80dvh] w-full rounded-lg object-contain" />
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
