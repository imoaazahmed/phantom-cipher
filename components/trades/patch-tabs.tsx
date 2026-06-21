"use client"

import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef, type MutableRefObject } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useForm } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import {
  Check,
  Eye,
  Copy,
  EyeOff,
  Hash,
  Menu,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import type { Patch } from "@/lib/trades/types"
import {
  patchNameSchema,
  patchLimitSchema,
  patchCreateSchema,
} from "@/lib/schemas/patch"
import type * as yup from "yup"

type SortablePatchTabProps = {
  patch: Patch
  activePatchId: string
  isLast: boolean
  addButtonRef: MutableRefObject<HTMLButtonElement | null>
  onTabChange: (id: string) => void
  openRename: (patch: Patch) => void
  openEditLimit: (patch: Patch) => void
  onDuplicatePatch: (id: string) => Promise<void>
  onHidePatch: (id: string) => Promise<void>
  setDeleteTarget: (patch: Patch | null) => void
  dragOccurredRef: MutableRefObject<boolean>
}

function SortablePatchTab({
  patch,
  activePatchId,
  isLast,
  addButtonRef,
  onTabChange,
  openRename,
  openEditLimit,
  onDuplicatePatch,
  onHidePatch,
  setDeleteTarget,
  dragOccurredRef,
}: SortablePatchTabProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: patch.id })

  const buttonRef = useRef<HTMLButtonElement>(null)
  const combinedRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setNodeRef(node)
      ;(buttonRef as MutableRefObject<HTMLButtonElement | null>).current = node
    },
    [setNodeRef]
  )

  useEffect(() => {
    if (patch.id !== activePatchId) return
    const target = isLast ? addButtonRef.current : buttonRef.current
    target?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })
  }, [patch.id, activePatchId, isLast, addButtonRef])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={combinedRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => {
            if (dragOccurredRef.current) {
              dragOccurredRef.current = false
              return
            }
            onTabChange(patch.id)
          }}
          className={cn(
            "flex h-full items-center justify-center border-e border-border/40 px-3",
            "cursor-pointer text-xs font-medium whitespace-nowrap transition-colors select-none",
            patch.id === activePatchId
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            isDragging && "opacity-0"
          )}
        >
          {patch.name}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent side="top">
        <ContextMenuItem onClick={() => openRename(patch)} className="gap-2">
          <Pencil className="size-3.5" />
          {t("trades.patches.rename")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => openEditLimit(patch)}
          className="gap-2"
        >
          <Hash className="size-3.5" />
          {t("trades.patches.editLimit")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDuplicatePatch(patch.id)}
          className="gap-2"
        >
          <Copy className="size-3.5" />
          {t("trades.patches.duplicate")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onHidePatch(patch.id)}
          className="gap-2"
        >
          <EyeOff className="size-3.5" />
          {t("trades.patches.hide")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => setDeleteTarget(patch)}
          variant="destructive"
          className="gap-2"
        >
          <Trash2 className="size-3.5" />
          {t("trades.patches.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

type PatchDialog =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "rename"; patch: Patch }
  | { open: true; mode: "editLimit"; patch: Patch }

type Props = {
  patches: Patch[]
  activePatchId: string
  onTabChange: (patchId: string) => void
  onNewPatch: (name: string, patchLimit: number) => Promise<void>
  onRenamePatch: (id: string, name: string) => Promise<void>
  onEditLimit: (id: string, patchLimit: number) => Promise<void>
  onDuplicatePatch: (id: string) => Promise<void>
  onDeletePatch: (id: string) => Promise<void>
  onHidePatch: (id: string) => Promise<void>
  onShowPatch: (id: string) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
}

export type PatchTabsHandle = {
  openCreate: () => void
}

export const PatchTabs = forwardRef<PatchTabsHandle, Props>(function PatchTabs({
  patches,
  activePatchId,
  onTabChange,
  onNewPatch,
  onRenamePatch,
  onEditLimit,
  onDuplicatePatch,
  onDeletePatch,
  onHidePatch,
  onShowPatch,
  onReorder,
}, ref) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<PatchDialog>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Patch | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const schemaRef = useRef<yup.AnyObjectSchema>(patchNameSchema)
  const resolver = useCallback(
    (...args: Parameters<ReturnType<typeof yupResolver>>) =>
      yupResolver(schemaRef.current)(...args),
    []
  )
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver })

  const dragOccurredRef = useRef(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const activePatch = activeId ? (patches.find((p) => p.id === activeId) ?? null) : null

  const visiblePatches = patches.filter((p) => !p.is_hidden)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    dragOccurredRef.current = false
    setActiveId(String(active.id))
  }, [])

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    dragOccurredRef.current = true
    setTimeout(() => { dragOccurredRef.current = false }, 0)
    setActiveId(null)
    if (!over || active.id === over.id) return
    const visible = patches.filter((p) => !p.is_hidden)
    const visibleIds = visible.map((p) => p.id)
    const from = visibleIds.indexOf(String(active.id))
    const to = visibleIds.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const newVisibleIds = arrayMove(visibleIds, from, to)
    // Interleave hidden patches back at their original positions
    const allIds: string[] = []
    let vi = 0
    for (const p of patches) {
      allIds.push(p.is_hidden ? p.id : newVisibleIds[vi++])
    }
    onReorder(allIds)
  }, [patches, onReorder])

  function openCreate() {
    schemaRef.current = patchCreateSchema
    reset({ name: "New Patch", patch_limit: "100" })
    setDialog({ open: true, mode: "create" })
  }

  useImperativeHandle(ref, () => ({ openCreate }), [])

  function openRename(patch: Patch) {
    schemaRef.current = patchNameSchema
    reset({ name: patch.name })
    setDialog({ open: true, mode: "rename", patch })
  }

  function openEditLimit(patch: Patch) {
    schemaRef.current = patchLimitSchema
    reset({ patch_limit: String(patch.patch_limit) })
    setDialog({ open: true, mode: "editLimit", patch })
  }

  const onDialogSubmit = handleSubmit(async (data) => {
    if (!dialog.open) return
    if (dialog.mode === "create") {
      await onNewPatch(data.name!, parseInt(data.patch_limit!, 10))
    } else if (dialog.mode === "rename") {
      await onRenamePatch(dialog.patch.id, data.name!)
    } else {
      await onEditLimit(dialog.patch.id, parseInt(data.patch_limit!, 10))
    }
    setDialog({ open: false })
  })

  return (
    <>
      <div className="flex h-full items-stretch overflow-hidden">
        {/* Fixed: all-patches menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-full w-9 shrink-0 rounded-none p-0"
            >
              <Menu className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {patches.length === 0 && (
              <DropdownMenuLabel className="text-muted-foreground font-normal">
                {t("trades.patches.emptyTitle")}
              </DropdownMenuLabel>
            )}
            {patches.map((patch) => (
              <DropdownMenuItem
                key={patch.id}
                onClick={() =>
                  patch.is_hidden
                    ? onShowPatch(patch.id)
                    : onTabChange(patch.id)
                }
                className="gap-2"
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    patch.id === activePatchId ? "opacity-100" : "opacity-0"
                  )}
                />
                <span
                  className={cn(patch.is_hidden && "text-muted-foreground")}
                >
                  {patch.name}
                </span>
                {patch.is_hidden && (
                  <Eye className="ms-auto size-3.5 text-muted-foreground" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px shrink-0 self-stretch bg-border" />

        {/* Scrollable: tabs + add button */}
        <ScrollAreaPrimitive.Root className="flex-1 overflow-hidden">
          <ScrollAreaPrimitive.Viewport className="h-full w-full">
            <div className="flex h-9 w-max items-stretch">
              <DndContext
                id="patch-tabs-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={visiblePatches.map((p) => p.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {visiblePatches.map((patch, i) => (
                    <SortablePatchTab
                      key={patch.id}
                      patch={patch}
                      activePatchId={activePatchId}
                      isLast={i === visiblePatches.length - 1}
                      addButtonRef={addButtonRef}
                      onTabChange={onTabChange}
                      openRename={openRename}
                      openEditLimit={openEditLimit}
                      onDuplicatePatch={onDuplicatePatch}
                      onHidePatch={onHidePatch}
                      setDeleteTarget={setDeleteTarget}
                      dragOccurredRef={dragOccurredRef}
                    />
                  ))}
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activePatch && (
                    <button
                      className={cn(
                        "flex h-9 items-center justify-center border-e border-border/40 px-3",
                        "cursor-grabbing text-xs font-medium whitespace-nowrap select-none shadow-md",
                        activePatch.id === activePatchId
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground bg-muted/50"
                      )}
                    >
                      {activePatch.name}
                    </button>
                  )}
                </DragOverlay>
              </DndContext>

              {/* New patch */}
              <Button
                ref={addButtonRef}
                variant="ghost"
                onClick={openCreate}
                aria-label={t("trades.newPatch")}
                className="h-full w-9 shrink-0 rounded-none border-e border-border/40 p-0"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.Scrollbar
            orientation="horizontal"
            className="flex h-1.5 touch-none flex-col border-t border-t-transparent p-px transition-colors select-none"
          >
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-none bg-border" />
          </ScrollAreaPrimitive.Scrollbar>
        </ScrollAreaPrimitive.Root>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogCancel size="icon-sm" variant="ghost" className="absolute inset-e-3 top-3" disabled={isDeleting}>
            <X className="size-4" />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("trades.patches.deleteConfirmTitle", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("trades.patches.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("trades.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteTarget) return
                setIsDeleting(true)
                await onDeletePatch(deleteTarget.id)
                setIsDeleting(false)
                setDeleteTarget(null)
              }}
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting && <Spinner data-icon="inline-start" />}
              {t("trades.patches.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / Rename / Edit Limit Dialog */}
      <Dialog
        open={dialog.open}
        onOpenChange={(o) => {
          if (!o) {
            reset()
            setDialog({ open: false })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {!dialog.open
                ? null
                : dialog.mode === "create"
                  ? t("trades.patches.newTitle")
                  : dialog.mode === "rename"
                    ? t("trades.patches.renameTitle")
                    : t("trades.patches.editLimitTitle")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onDialogSubmit}>
            <div className="space-y-4 py-2">
              {dialog.open && dialog.mode !== "editLimit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="patch-name">
                    {t("trades.patches.nameLabel")}
                  </Label>
                  <Input
                    id="patch-name"
                    {...register("name")}
                    placeholder="New Patch"
                    autoFocus
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">
                      {t(errors.name.message as string)}
                    </p>
                  )}
                </div>
              )}
              {dialog.open &&
                (dialog.mode === "create" || dialog.mode === "editLimit") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="patch-limit">
                      {t("trades.patches.patchLimitLabel")}
                    </Label>
                    <Input
                      id="patch-limit"
                      {...register("patch_limit")}
                      placeholder="100"
                      autoFocus={dialog.mode === "editLimit"}
                    />
                    {errors.patch_limit && (
                      <p className="text-xs text-destructive">
                        {t(errors.patch_limit.message as string)}
                      </p>
                    )}
                  </div>
                )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset()
                  setDialog({ open: false })
                }}
                disabled={isSubmitting}
              >
                {t("trades.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {dialog.open && dialog.mode === "create"
                  ? t("trades.patches.create")
                  : t("trades.form.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
})
