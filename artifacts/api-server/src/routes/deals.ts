import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  CreateDealBody,
  CreateDealResponse,
  DeleteDealParams,
  DeleteDealResponse,
  GetAdminDealsResponse,
  GetAdminSummaryResponse,
  GetDealsQueryParams,
  GetDealsResponse,
  UpdateDealBody,
  UpdateDealParams,
  UpdateDealResponse,
  UploadDealImageParams,
  UploadDealImageResponse,
  type Deal,
  type DealCategory,
} from "@workspace/api-zod";
import { requireDealSaverAdmin } from "../middlewares/dealsaverAdmin";
import {
  getSupabaseAdmin,
  SupabaseConfigurationError,
} from "../lib/supabase";

const router: IRouter = Router();

type DealRow = Omit<
  Deal,
  "original_price" | "sale_price" | "start_date" | "end_date" | "created_at" | "updated_at"
> & {
  original_price: number | string;
  sale_price: number | string;
  start_date: string | Date;
  end_date: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const allowedImageMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const imageContentTypeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(
      null,
      allowedImageMimeTypes.has(file.mimetype.toLowerCase()) ||
        extension in imageContentTypeByExtension,
    );
  },
});

function toDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function normalizeDeal(row: DealRow): Deal {
  const startDate = toDateOnly(row.start_date);
  const endDate = toDateOnly(row.end_date);

  return {
    ...row,
    original_price: Number(row.original_price),
    sale_price: Number(row.sale_price),
    start_date: new Date(`${startDate}T00:00:00.000Z`),
    end_date: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

function isCurrentDeal(row: DealRow, today: string): boolean {
  const startDate = toDateOnly(row.start_date) ?? "";
  const endDate = toDateOnly(row.end_date);
  return row.is_active && startDate <= today && (!endDate || endDate >= today);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function reportSupabaseError(
  req: Request,
  res: Response,
  error: unknown,
  message: string,
): void {
  if (error instanceof SupabaseConfigurationError) {
    res.status(503).json({
      error:
        "DealSaver is not connected to Supabase yet. Add the project's Supabase URL and service role key in Replit Secrets.",
    });
    return;
  }

  const supabaseError =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const code =
    typeof supabaseError.code === "string" ? supabaseError.code : "";
  const detail =
    typeof supabaseError.message === "string"
      ? supabaseError.message.toLowerCase()
      : "";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42501" ||
    detail.includes("bucket not found")
  ) {
    res.status(503).json({
      error:
        code === "42501"
          ? "DealSaver’s Supabase server permissions are missing. Re-run supabase/setup.sql in the Supabase SQL Editor, then retry."
          : "DealSaver’s Supabase schema or image bucket is not set up yet. Run supabase/setup.sql in the Supabase SQL Editor, then retry.",
    });
    return;
  }

  req.log.error({ err: error }, message);
  res.status(500).json({ error: message });
}

function storagePathFromPublicUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  try {
    const pathname = new URL(imageUrl).pathname;
    const marker = "/storage/v1/object/public/deal-images/";
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const storagePath = decodeURIComponent(
      pathname.slice(markerIndex + marker.length),
    );
    if (!storagePath || storagePath.split("/").includes("..")) return null;
    return storagePath;
  } catch {
    return null;
  }
}

async function removeStoredImage(
  imageUrl: string | null | undefined,
  req: Request,
): Promise<void> {
  const storagePath = storagePathFromPublicUrl(imageUrl);
  if (!storagePath) return;
  const { error } = await getSupabaseAdmin()
    .storage.from("deal-images")
    .remove([storagePath]);
  if (error) {
    req.log.warn({ err: error }, "Could not remove a DealSaver product image");
  }
}

router.get("/deals", async (req, res): Promise<void> => {
  const query = GetDealsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("deals")
      .select("*")
      .eq("is_active", true)
      .order("is_hot", { ascending: false })
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    const search = query.data.search?.trim().toLocaleLowerCase();
    const deals = ((data ?? []) as DealRow[])
      .filter((deal) => isCurrentDeal(deal, today))
      .filter(
        (deal) =>
          !query.data.category || deal.category === query.data.category,
      )
      .filter(
        (deal) =>
          !search ||
          `${deal.product_name} ${deal.store} ${deal.description ?? ""}`
            .toLocaleLowerCase()
            .includes(search),
      )
      .map(normalizeDeal);

    res.json(GetDealsResponse.parse(deals));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load current deals.");
  }
});

router.use("/admin", requireDealSaverAdmin);

router.get("/admin/summary", async (req, res): Promise<void> => {
  try {
    const { data, error } = await getSupabaseAdmin().from("deals").select("*");
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    const deals = (data ?? []) as DealRow[];
    const summary = {
      total: deals.length,
      active: deals.filter((deal) => isCurrentDeal(deal, today)).length,
      featured: deals.filter((deal) => deal.is_featured).length,
      hidden: deals.filter((deal) => !deal.is_active).length,
    };

    res.json(GetAdminSummaryResponse.parse(summary));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load deal totals.");
  }
});

router.get("/admin/deals", async (req, res): Promise<void> => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("deals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(
      GetAdminDealsResponse.parse(
        ((data ?? []) as DealRow[]).map(normalizeDeal),
      ),
    );
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load the deal library.");
  }
});

router.post("/admin/deals", async (req, res): Promise<void> => {
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const deal = parsed.data;
  if (!isHttpUrl(deal.affiliate_url)) {
    res.status(400).json({ error: "Enter a valid HTTP or HTTPS product URL." });
    return;
  }
  if (deal.sale_price > deal.original_price) {
    res.status(400).json({
      error: "Sale price cannot be higher than the original price.",
    });
    return;
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("deals")
      .insert({
        product_name: deal.product_name.trim(),
        store: deal.store.trim(),
        category: deal.category as DealCategory,
        original_price: deal.original_price,
        sale_price: deal.sale_price,
        affiliate_url: deal.affiliate_url,
        image_url: deal.image_url ?? null,
        description: deal.description?.trim() || null,
        start_date: toDateOnly(deal.start_date),
        end_date: toDateOnly(deal.end_date),
        is_featured: deal.is_featured ?? false,
        is_hot: deal.is_hot ?? false,
        is_active: deal.is_active ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    res.status(201).json(CreateDealResponse.parse(normalizeDeal(data as DealRow)));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not create this deal.");
  }
});

router.patch("/admin/deals/:id", async (req, res): Promise<void> => {
  const params = UpdateDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: currentData, error: currentError } = await supabase
      .from("deals")
      .select("*")
      .eq("id", params.data.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentData) {
      res.status(404).json({ error: "Deal not found." });
      return;
    }

    const current = currentData as DealRow;
    const mergedOriginal = Number(
      parsed.data.original_price ?? current.original_price,
    );
    const mergedSale = Number(parsed.data.sale_price ?? current.sale_price);
    if (mergedSale > mergedOriginal) {
      res.status(400).json({
        error: "Sale price cannot be higher than the original price.",
      });
      return;
    }

    if (
      parsed.data.affiliate_url !== undefined &&
      !isHttpUrl(parsed.data.affiliate_url)
    ) {
      res
        .status(400)
        .json({ error: "Enter a valid HTTP or HTTPS product URL." });
      return;
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    if ("product_name" in patch && typeof patch.product_name === "string") {
      patch.product_name = patch.product_name.trim();
    }
    if ("store" in patch && typeof patch.store === "string") {
      patch.store = patch.store.trim();
    }
    if ("description" in patch && typeof patch.description === "string") {
      patch.description = patch.description.trim() || null;
    }
    if ("start_date" in patch) {
      patch.start_date = toDateOnly(parsed.data.start_date);
    }
    if ("end_date" in patch) {
      patch.end_date = toDateOnly(parsed.data.end_date);
    }

    const { data, error } = await supabase
      .from("deals")
      .update(patch)
      .eq("id", params.data.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Deal not found." });
      return;
    }

    if (parsed.data.image_url === null) {
      await removeStoredImage(current.image_url, req);
    }

    res.json(UpdateDealResponse.parse(normalizeDeal(data as DealRow)));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not update this deal.");
  }
});

router.delete("/admin/deals/:id", async (req, res): Promise<void> => {
  const params = DeleteDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: current, error: currentError } = await supabase
      .from("deals")
      .select("image_url")
      .eq("id", params.data.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      res.status(404).json({ error: "Deal not found." });
      return;
    }

    const { error } = await supabase
      .from("deals")
      .delete()
      .eq("id", params.data.id);
    if (error) throw error;
    await removeStoredImage(current.image_url, req);
    res.json(DeleteDealResponse.parse({ success: true }));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not delete this deal.");
  }
});

router.post(
  "/admin/deals/:id/image",
  (req, res, next) => {
    imageUpload.single("file")(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        res.status(status).json({
          error:
            error.code === "LIMIT_FILE_SIZE"
              ? "Choose an image smaller than 10 MB."
              : "Choose one product image at a time.",
        });
        return;
      }
      if (error) {
        res.status(400).json({ error: "Could not read this image upload." });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    const params = UploadDealImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!req.file) {
      res.status(415).json({
        error: "Choose a JPG, PNG, WEBP, HEIC, or HEIF product image.",
      });
      return;
    }

    const extension = path.extname(req.file.originalname).toLowerCase();
    const contentType =
      imageContentTypeByExtension[extension] ??
      req.file.mimetype.toLowerCase();
    if (!allowedImageMimeTypes.has(contentType)) {
      res.status(415).json({
        error: "Choose a JPG, PNG, WEBP, HEIC, or HEIF product image.",
      });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data: current, error: currentError } = await supabase
        .from("deals")
        .select("image_url")
        .eq("id", params.data.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) {
        res.status(404).json({ error: "Deal not found." });
        return;
      }

      const storagePath = `${params.data.id}/${randomUUID()}${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("deal-images")
        .upload(storagePath, req.file.buffer, {
          contentType,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const imageUrl = supabase.storage
        .from("deal-images")
        .getPublicUrl(storagePath).data.publicUrl;
      const { data, error: updateError } = await supabase
        .from("deals")
        .update({ image_url: imageUrl })
        .eq("id", params.data.id)
        .select("*")
        .single();
      if (updateError) {
        await supabase.storage.from("deal-images").remove([storagePath]);
        throw updateError;
      }

      await removeStoredImage(current.image_url, req);
      const normalized = normalizeDeal(data as DealRow);
      res.json(
        UploadDealImageResponse.parse({ image_url: normalized.image_url }),
      );
    } catch (error) {
      reportSupabaseError(req, res, error, "Could not upload this product image.");
    }
  },
);

export default router;