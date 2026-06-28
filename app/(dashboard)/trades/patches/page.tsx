import { createClient } from '@/lib/supabase/server'
import { TradesClient } from '@/components/trades/trades-client'
import type { Patch, ColumnSetting, ColumnOption } from '@/lib/trades/types'

export default async function TradesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: rows }, { data: settingsRows }, { data: optionsRows }] = await Promise.all([
    supabase
      .from('patches')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('column_settings')
      .select('*')
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order('created_at', { ascending: true }),
    supabase
      .from('column_options')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true }),
  ])

  const patches: Patch[] = (rows ?? []) as Patch[]
  const columnSettings: ColumnSetting[] = (settingsRows ?? []) as ColumnSetting[]
  // All patches carry the same column_visibility — read from the first one.
  const savedColumnVisibility = (patches[0]?.column_visibility ?? null) as Record<string, boolean> | null

  const rawOptions = (optionsRows ?? []) as ColumnOption[]
  const initialColumnOptions: Record<string, { value: string; label: string }[]> = {}
  for (const row of rawOptions) {
    if (!initialColumnOptions[row.column_id]) initialColumnOptions[row.column_id] = []
    initialColumnOptions[row.column_id].push({ value: row.value, label: row.label })
  }

  return (
    <TradesClient
      patches={patches}
      columnSettings={columnSettings}
      savedColumnVisibility={savedColumnVisibility}
      initialColumnOptions={initialColumnOptions}
    />
  )
}
