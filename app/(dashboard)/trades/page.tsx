import { createClient } from '@/lib/supabase/server'
import { TradesClient } from '@/components/trades/trades-client'
import type { Patch, ColumnSetting } from '@/lib/trades/types'

export default async function TradesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: rows }, { data: settingsRows }] = await Promise.all([
    supabase
      .from('patches')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('column_settings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ])

  const patches: Patch[] = (rows ?? []) as Patch[]
  const columnSettings: ColumnSetting[] = (settingsRows ?? []) as ColumnSetting[]
  // All patches carry the same column_visibility — read from the first one.
  const savedColumnVisibility = (patches[0]?.column_visibility ?? null) as Record<string, boolean> | null

  return (
    <TradesClient
      patches={patches}
      columnSettings={columnSettings}
      savedColumnVisibility={savedColumnVisibility}
    />
  )
}
