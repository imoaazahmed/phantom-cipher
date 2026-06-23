"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { AddColumnDialog } from "./add-column-dialog"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty"
import { enrichTrades } from "@/lib/trades/calculations"
import { compileFormula, topoSort } from "@/lib/trades/formula-engine"
import { DEFAULT_COLUMN_ORDER } from "@/lib/trades/column-order"
import {
  createPatch,
  updatePatch,
  deletePatch,
  duplicatePatch,
  getPatchTrades,
  getPatchDraftTrades,
  saveColumnVisibility,
  saveColumnOrderGlobal,
  saveColumnOptions,
  createDraftTrade,
  patchTrade,
  deleteTrade,
  duplicateTrade,
} from "@/lib/trades/actions"
import { DEFAULT_MENU_OPTIONS } from "@/lib/trades/column-options"
import type { Patch, RawTrade, TradeFormData, ColumnSetting, FormulaColumn } from "@/lib/trades/types"

// Module-level: persists across component mounts/unmounts so in-flight writes
// survive a navigation that unmounts and remounts TradesClient, preventing a
// re-fetch from reading stale DB data before the write has committed.
const _pendingWrites = new Map<string, Set<Promise<unknown>>>()

function _trackWrite(patchId: string, promise: Promise<unknown>) {
  if (!_pendingWrites.has(patchId)) _pendingWrites.set(patchId, new Set())
  const set = _pendingWrites.get(patchId)!
  set.add(promise)
  promise.finally(() => set.delete(promise))
}

function _waitForWrites(patchId: string): Promise<void> {
  const set = _pendingWrites.get(patchId)
  if (!set || set.size === 0) return Promise.resolve()
  return Promise.all([...set]).then(() => {})
}

type Props = {
  patches: Patch[]
  columnSettings: ColumnSetting[]
  savedColumnVisibility: Record<string, boolean> | null
  initialColumnOptions: Record<string, { value: string; label: string }[]>
}

const LAST_PATCH_KEY = "trading-logs:last-patch"

function fallbackPatch(list: Patch[], removedId: string): string {
  const removedIndex = list.findIndex((p) => p.id === removedId)
  for (let i = removedIndex - 1; i >= 0; i--) {
    if (!list[i].is_hidden) return list[i].id
  }
  return list.find((p) => p.id !== removedId && !p.is_hidden)?.id ?? ""
}

export function TradesClient({ patches: initialPatches, columnSettings, savedColumnVisibility, initialColumnOptions }: Props) {
  const { t } = useTranslation()
  const [patches, setPatches] = useState<Patch[]>(initialPatches)
  const [columnOptions, setColumnOptions] = useState<Record<string, { value: string; label: string }[]>>(
    () => ({ ...DEFAULT_MENU_OPTIONS, ...initialColumnOptions })
  )
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
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [tradeCache, setTradeCache] = useState<Map<string, RawTrade[]>>(new Map())
  const [draftTradeCache, setDraftTradeCache] = useState<Map<string, RawTrade[]>>(new Map())
  const [loadingTrades, setLoadingTrades] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    savedColumnVisibility ?? {}
  )

  type Scope = 'global' | 'per-patch'
  const [visibilityScope, setVisibilityScope] = useState<Scope>(() => {
    try { return (localStorage.getItem('trading-logs:visibility-scope') as Scope) ?? 'global' }
    catch { return 'global' }
  })
  const [orderScope, setOrderScope] = useState<Scope>(() => {
    try { return (localStorage.getItem('trading-logs:order-scope') as Scope) ?? 'global' }
    catch { return 'global' }
  })

  function handleVisibilityScopeChange(scope: Scope) {
    setVisibilityScope(scope)
    try { localStorage.setItem('trading-logs:visibility-scope', scope) } catch {}
  }

  function handleOrderScopeChange(scope: Scope) {
    setOrderScope(scope)
    try { localStorage.setItem('trading-logs:order-scope', scope) } catch {}
  }

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
    // Cache hit: show existing data instantly (preserves scroll, avoids flicker).
    // Any pending writes have already been tracked via _trackWrite; when they
    // complete they will silently refresh the cache without a loading state.
    if (tradeCache.has(activePatchId)) return
    setLoadingTrades(true)
    const pId = activePatchId
    // Fresh mount / first visit to this patch: wait for any in-flight writes
    // before reading from DB so we never see stale data on a quick navigate-back.
    _waitForWrites(pId).then(() =>
      Promise.all([getPatchTrades(pId), getPatchDraftTrades(pId)]).then(
        ([{ data: real }, { data: drafts }]) => {
          setTradeCache((prev) => new Map(prev).set(pId, real))
          setDraftTradeCache((prev) => new Map(prev).set(pId, drafts))
          setLoadingTrades(false)
        }
      )
    )
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

  function persistVisibility(next: Record<string, boolean>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (visibilityScope === 'global') {
      saveTimer.current = setTimeout(() => saveColumnVisibility(next), 800)
    } else {
      const pId = activePatchId
      saveTimer.current = setTimeout(() => updatePatch(pId, { column_visibility: next }), 800)
    }
  }

  function handleVisibilityChange(columnId: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [columnId]: visible }
      persistVisibility(next)
      return next
    })
  }

  function handleHideColumn(columnId: string) {
    handleVisibilityChange(columnId, false)
  }

  function handleShowAll() {
    const next: Record<string, boolean> = {}
    DEFAULT_COLUMN_ORDER.forEach((id) => { next[id] = true })
    setColumnVisibility(next)
    persistVisibility(next)
  }

  async function handleColumnReorder(order: string[]) {
    const id = activePatchId
    if (!id) return
    if (orderScope === 'global') {
      setPatches((prev) => prev.map((p) => ({ ...p, column_order: order })))
      await saveColumnOrderGlobal(order)
    } else {
      setPatches((prev) =>
        prev.map((p) => (p.id === id ? { ...p, column_order: order } : p))
      )
      await updatePatch(id, { column_order: order })
    }
  }

  async function handleCreateTrade(sortOrder?: number): Promise<RawTrade | null> {
    const { data } = await createDraftTrade(activePatchId, sortOrder)
    if (data) {
      setDraftTradeCache((prev) => {
        const current = prev.get(activePatchId) ?? []
        return new Map(prev).set(activePatchId, [...current, data])
      })
    }
    return data ?? null
  }

  function handlePatchTrade(tradeId: string, fields: Partial<TradeFormData>) {
    const pId = activePatchId
    // Optimistic update for real trades
    setTradeCache((prev) => {
      const current = prev.get(pId) ?? []
      const updated = current.map((t) => (t.id === tradeId ? { ...t, ...fields } : t))
      return new Map(prev).set(pId, updated)
    })
    // Optimistic update for draft trades
    setDraftTradeCache((prev) => {
      const current = prev.get(pId) ?? []
      const idx = current.findIndex((t) => t.id === tradeId)
      if (idx === -1) return prev
      const updated = [...current]
      updated[idx] = { ...updated[idx], ...fields }
      return new Map(prev).set(pId, updated)
    })
    // Write to DB, then silently refresh the cache so subsequent patch-switches
    // and remounts always see DB-confirmed data — no loading state shown.
    const fullPromise = patchTrade(tradeId, fields).then(() =>
      Promise.all([getPatchTrades(pId), getPatchDraftTrades(pId)]).then(
        ([{ data: real }, { data: drafts }]) => {
          setTradeCache((prev) => new Map(prev).set(pId, real))
          setDraftTradeCache((prev) => new Map(prev).set(pId, drafts))
        }
      )
    )
    // Track the full promise (write + refresh) so remount fetches wait for it
    _trackWrite(pId, fullPromise)
  }

  async function handleDeleteTrade(tradeId: string) {
    const pId = activePatchId
    // Optimistic removal from both caches
    setTradeCache((prev) => {
      const current = prev.get(pId) ?? []
      return new Map(prev).set(pId, current.filter((t) => t.id !== tradeId))
    })
    setDraftTradeCache((prev) => {
      const current = prev.get(pId) ?? []
      return new Map(prev).set(pId, current.filter((t) => t.id !== tradeId))
    })
    await deleteTrade(tradeId)
    // Background re-fetch after commit so any concurrent patch background refresh
    // cannot restore the deleted row. Tracked in _pendingWrites for remount safety.
    const refresh = Promise.all([getPatchTrades(pId), getPatchDraftTrades(pId)]).then(
      ([{ data: real }, { data: drafts }]) => {
        setTradeCache((prev) => new Map(prev).set(pId, real))
        setDraftTradeCache((prev) => new Map(prev).set(pId, drafts))
      }
    )
    _trackWrite(pId, refresh)
  }

  async function handleDuplicateTrade(tradeId: string) {
    const pId = activePatchId
    const { data } = await duplicateTrade(tradeId)
    if (data) {
      if (data.is_draft) {
        setDraftTradeCache((prev) => {
          const current = prev.get(pId) ?? []
          return new Map(prev).set(pId, [...current, data])
        })
      } else {
        setTradeCache((prev) => {
          const current = prev.get(pId) ?? []
          return new Map(prev).set(pId, [...current, data])
        })
      }
    }
  }

  async function handleSaveColumnOptions(columnId: string, options: { value: string; label: string }[]) {
    const { error } = await saveColumnOptions(columnId, options)
    if (!error) {
      setColumnOptions((prev) => ({ ...prev, [columnId]: options }))
    }
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

  const formulaColumns = useMemo<FormulaColumn[]>(() => {
    const sorted = topoSort(columnSettings.filter((s) => s.is_formula && s.formula))
    return sorted.map((s) => ({
      columnId: s.column_id,
      formulaId: s.column_id,
      fn: compileFormula(s.formula!),
    }))
  }, [columnSettings])

  const rawTrades = tradeCache.get(activePatchId) ?? []
  const draftTrades = draftTradeCache.get(activePatchId) ?? []
  const enriched = enrichTrades(rawTrades, formulaColumns)
  const allHidden = patches.length > 0 && patches.every((p) => p.is_hidden)
  const noPatches = patches.length === 0
  const activePatch = patches.find((p) => p.id === activePatchId)

  return (
    <div className="flex h-full flex-col">
      {activePatch && !noPatches && !allHidden && (
        <div className="flex items-center justify-between px-4 py-1.5">
          <h1 className="text-sm font-semibold">{activePatch.name}</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddColumnOpen(true)}>
              <Plus className="size-4" />
              {t('trades.columns.addColumn')}
            </Button>
            <ColumnsDialog
              columnVisibility={columnVisibility}
              onVisibilityChange={handleVisibilityChange}
              onShowAll={handleShowAll}
              columnSettings={columnSettings}
              visibilityScope={visibilityScope}
              onVisibilityScopeChange={handleVisibilityScopeChange}
              orderScope={orderScope}
              onOrderScopeChange={handleOrderScopeChange}
            />
          </div>
          <AddColumnDialog
            open={addColumnOpen}
            onOpenChange={setAddColumnOpen}
            existingFormulaIds={columnSettings.map(s => s.column_id)}
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
              <div className="flex flex-col">
                <TradesTable
                  key={activePatchId}
                  trades={enriched}
                  scrolledX={scrolledX}
                  scrolledY={scrolledY}
                  initialColumnOrder={activePatch?.column_order ?? null}
                  onColumnReorder={handleColumnReorder}
                  columnVisibility={columnVisibility}
                  onHideColumn={handleHideColumn}
                  columnSettings={columnSettings}
                  columnOptions={columnOptions}
                  onSaveColumnOptions={handleSaveColumnOptions}
                  formulaColumns={formulaColumns}
                  initialDraftTrades={draftTrades}
                  onCreateTrade={handleCreateTrade}
                  onPatchTrade={handlePatchTrade}
                  onDeleteTrade={handleDeleteTrade}
                  onDuplicateTrade={handleDuplicateTrade}
                />
                <div className="border-t border-[--color-border] p-4">
                  {/* Statistics panel */}
                </div>
              </div>
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
