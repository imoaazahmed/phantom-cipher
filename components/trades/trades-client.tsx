"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryState } from "nuqs"
import { useTranslation } from "react-i18next"
import { ChartCandlestick, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"
import { ScrollBar } from "@/components/ui/scroll-area"
import { PatchTabs, type PatchTabsHandle } from "./patch-tabs"
import { TradesTable } from "./trades-table"
import { ColumnsDialog } from "./columns-dialog"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty"
import { enrichTrades } from "@/lib/trades/calculations"
import {
  createPatch,
  updatePatch,
  deletePatch,
  duplicatePatch,
  getPatchTrades,
} from "@/lib/trades/actions"
import type { Patch, RawTrade } from "@/lib/trades/types"

type Props = {
  patches: Patch[]
}

const LAST_PATCH_KEY = "trading-logs:last-patch"
const COLUMN_VISIBILITY_KEY = "trading-logs:column-visibility"

function fallbackPatch(list: Patch[], removedId: string): string {
  const removedIndex = list.findIndex((p) => p.id === removedId)
  for (let i = removedIndex - 1; i >= 0; i--) {
    if (!list[i].is_hidden) return list[i].id
  }
  return list.find((p) => p.id !== removedId && !p.is_hidden)?.id ?? ""
}

export function TradesClient({ patches: initialPatches }: Props) {
  const { t } = useTranslation()
  const [patches, setPatches] = useState<Patch[]>(initialPatches)
  const [patchId, setPatchId] = useQueryState("patch", { defaultValue: "" })

  const [localPatchId, setLocalPatchId] = useState<string>("")

  function activatePatch(id: string) {
    // Save current scroll before switching away
    const vp = viewportRef.current
    if (vp && activePatchId) {
      scrollMemory.current.set(activePatchId, { left: vp.scrollLeft, top: vp.scrollTop })
    }
    setLocalPatchId(id)
    setPatchId(id)
    localStorage.setItem(LAST_PATCH_KEY, id)
  }

  const patchTabsRef = useRef<PatchTabsHandle>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollMemory = useRef<Map<string, { left: number; top: number }>>(new Map())
  const [scrolledX, setScrolledX] = useState(false)
  const [scrolledY, setScrolledY] = useState(false)
  const [tradeCache, setTradeCache] = useState<Map<string, RawTrade[]>>(new Map())
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLUMN_VISIBILITY_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  })

  // URL param (patchId) takes priority; then localStorage (localPatchId); then last visible.
  const activePatchId =
    patches.find((p) => p.id === patchId && !p.is_hidden)?.id ??
    patches.find((p) => p.id === localPatchId && !p.is_hidden)?.id ??
    patches.filter((p) => !p.is_hidden).at(-1)?.id ??
    ""

  // On mount: read localStorage first, then compute the correct target and sync
  // the URL param. Both steps must happen in one effect so the URL push uses
  // the stored patch — if split into two effects, the URL sync effect captures
  // activePatchId before localPatchId is set and pushes the wrong fallback.
  // Deferred via setTimeout(0) so the Next.js navigation transition has settled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let storedId = ""
    try {
      storedId = localStorage.getItem(LAST_PATCH_KEY) ?? ""
    } catch {}
    if (storedId) setLocalPatchId(storedId)

    const target =
      patches.find((p) => p.id === patchId && !p.is_hidden)?.id ??
      patches.find((p) => p.id === storedId && !p.is_hidden)?.id ??
      patches.filter((p) => !p.is_hidden).at(-1)?.id ??
      ""

    const timer = setTimeout(() => setPatchId(target || null), 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!activePatchId) return
    const cached = tradeCache.has(activePatchId)
    if (!cached) setLoadingTrades(true)
    getPatchTrades(activePatchId).then(({ data }) => {
      setTradeCache((prev) => new Map(prev).set(activePatchId, data))
      setLoadingTrades(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatchId])

  // Restore scroll position for the newly active patch after render
  useEffect(() => {
    if (!activePatchId) return
    const saved = scrollMemory.current.get(activePatchId)
    requestAnimationFrame(() => {
      const vp = viewportRef.current
      if (!vp) return
      vp.scrollLeft = saved?.left ?? 0
      vp.scrollTop = saved?.top ?? 0
      setScrolledX(Math.abs(vp.scrollLeft) > 0)
      setScrolledY(vp.scrollTop > 0)
    })
  }, [activePatchId])

  function handleViewportScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    setScrolledX(Math.abs(el.scrollLeft) > 0)
    setScrolledY(el.scrollTop > 0)
  }

  // Patch handlers
  async function handleNewPatch(name: string, patchLimit: number) {
    const { data } = await createPatch(name, patchLimit)
    if (data) {
      setPatches((prev) => [...prev, data])
      activatePatch(data.id)
    }
  }

  async function handleRenamePatch(id: string, name: string) {
    const { error } = await updatePatch(id, { name })
    if (!error)
      setPatches((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  async function handleEditLimit(id: string, patchLimit: number) {
    const { error } = await updatePatch(id, { patch_limit: patchLimit })
    if (!error)
      setPatches((prev) =>
        prev.map((p) => (p.id === id ? { ...p, patch_limit: patchLimit } : p))
      )
  }

  async function handleDuplicatePatch(id: string) {
    const { data } = await duplicatePatch(id)
    if (data) {
      setPatches((prev) => [...prev, data])
      activatePatch(data.id)
    }
  }

  async function handleDeletePatch(id: string) {
    const { error } = await deletePatch(id)
    if (!error) {
      scrollMemory.current.delete(id)
      const next = activePatchId === id ? fallbackPatch(patches, id) : null
      setPatches((prev) => prev.filter((p) => p.id !== id))
      if (next) activatePatch(next)
    }
  }

  async function handleHidePatch(id: string) {
    const { error } = await updatePatch(id, { is_hidden: true })
    if (!error) {
      const next = activePatchId === id ? fallbackPatch(patches, id) : null
      setPatches((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_hidden: true } : p))
      )
      if (next) activatePatch(next)
    }
  }

  async function handleShowPatch(id: string) {
    const { error } = await updatePatch(id, { is_hidden: false })
    if (!error) {
      setPatches((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_hidden: false } : p))
      )
      activatePatch(id)
    }
  }

  function handleVisibilityChange(columnId: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [columnId]: visible }
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next))
      return next
    })
  }

  function handleHideColumn(columnId: string) {
    handleVisibilityChange(columnId, false)
  }

  async function handleColumnReorder(order: string[]) {
    const id = activePatchId
    if (!id) return
    setPatches((prev) =>
      prev.map((p) => (p.id === id ? { ...p, column_order: order } : p))
    )
    await updatePatch(id, { column_order: order })
  }

  async function handleReorder(orderedIds: string[]) {
    setPatches((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]))
      return orderedIds.map((id) => map.get(id)).filter((p): p is Patch => !!p)
    })
    await Promise.all(
      orderedIds.map((id, index) => updatePatch(id, { sort_order: index }))
    )
  }

  const rawTrades = tradeCache.get(activePatchId) ?? []
  const enriched = enrichTrades(rawTrades)
  const allHidden = patches.length > 0 && patches.every((p) => p.is_hidden)
  const noPatches = patches.length === 0
  const activePatch = patches.find((p) => p.id === activePatchId)

  return (
    <div className="flex h-full flex-col">
      {activePatch && !noPatches && !allHidden && (
        <div className="flex items-center justify-between px-4 py-1.5">
          <h1 className="text-sm font-semibold">{activePatch.name}</h1>
          <ColumnsDialog
            columnVisibility={columnVisibility}
            onVisibilityChange={handleVisibilityChange}
          />
        </div>
      )}

      {noPatches || allHidden ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="bg-foreground/10 text-foreground"
              >
                <ChartCandlestick />
              </EmptyMedia>
              <EmptyTitle>
                {noPatches
                  ? t("trades.patches.emptyTitle")
                  : t("trades.patches.allHiddenTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {noPatches
                  ? t("trades.patches.emptyBody")
                  : t("trades.patches.allHiddenBody")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => patchTabsRef.current?.openCreate()}>
                <Plus className="size-4" />
                {t("trades.patches.createPatch")}
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <ScrollAreaPrimitive.Root className="relative flex-1 overflow-hidden">
          <ScrollAreaPrimitive.Viewport ref={viewportRef} className="size-full rounded-[inherit]" onScroll={handleViewportScroll}>
            {loadingTrades ? (
              <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
                <Spinner />
              </div>
            ) : (
              <TradesTable
                key={activePatchId}
                trades={enriched}
                scrolledX={scrolledX}
                scrolledY={scrolledY}
                initialColumnOrder={activePatch?.column_order ?? null}
                onColumnReorder={handleColumnReorder}
                columnVisibility={columnVisibility}
                onHideColumn={handleHideColumn}
              />
            )}
          </ScrollAreaPrimitive.Viewport>
          <ScrollBar orientation="vertical" />
          <ScrollBar orientation="horizontal" />
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      )}

      <div className="h-9 shrink-0 border-t bg-background">
        <PatchTabs
          ref={patchTabsRef}
          patches={patches}
          activePatchId={activePatchId}
          onTabChange={activatePatch}
          onNewPatch={handleNewPatch}
          onRenamePatch={handleRenamePatch}
          onEditLimit={handleEditLimit}
          onDuplicatePatch={handleDuplicatePatch}
          onDeletePatch={handleDeletePatch}
          onHidePatch={handleHidePatch}
          onShowPatch={handleShowPatch}
          onReorder={handleReorder}
        />
      </div>
    </div>
  )
}
