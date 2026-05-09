import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/po/BrandMark";
import { WarehouseTimeMotionClient } from "@/components/settings/WarehouseTimeMotionClient";
import { getWarehouseTimeMotionSettings } from "@/lib/warehouseTimeMotion";

export default async function WarehouseTimeMotionPage() {
  const settings = await getWarehouseTimeMotionSettings();

  return (
    <div className="pb-12">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <Link
              href="/configure"
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to configure
            </Link>
          </div>
          <div className="mb-2 flex items-center gap-3">
            <BrandMark size="sm" />
            <h1 className="font-display text-xl font-black tracking-tight text-[var(--text)]">
              Warehouse time motion
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Configure picking and loading capacity used by route planning.
          </p>
        </div>
      </header>

      <WarehouseTimeMotionClient initialSettings={settings} />
    </div>
  );
}
