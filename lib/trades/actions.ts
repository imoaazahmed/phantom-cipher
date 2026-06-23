// lib/trades/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Patch, RawTrade, TradeFormData, ColumnSetting, FormatType, ColumnOption } from './types'

export async function createPatch(
  name: string,
  patchLimit: number
): Promise<{ data: Patch | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  const { data: existing } = await supabase
    .from('patches')
    .select('patch_number')
    .eq('user_id', user.id)
    .order('patch_number', { ascending: false })
    .limit(1)

  const nextNumber = existing && existing.length > 0 ? existing[0].patch_number + 1 : 1

  const { data, error } = await supabase
    .from('patches')
    .insert({
      user_id: user.id,
      patch_number: nextNumber,
      name,
      patch_limit: patchLimit,
      sort_order: nextNumber,
    })
    .select()
    .single()

  if (error) return { data: null, error: 'errors.generic' }
  revalidatePath('/trades')
  return { data: data as Patch, error: null }
}

export async function updatePatch(
  patchId: string,
  updates: Partial<{ name: string; patch_limit: number; is_hidden: boolean; sort_order: number; column_order: string[] | null; column_visibility: Record<string, boolean> | null }>
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('patches')
    .update(updates)
    .eq('id', patchId)
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function duplicatePatch(
  patchId: string
): Promise<{ data: Patch | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  const { data: source } = await supabase
    .from('patches')
    .select('*')
    .eq('id', patchId)
    .eq('user_id', user.id)
    .single()

  if (!source) return { data: null, error: 'errors.generic' }

  const { data: existing } = await supabase
    .from('patches')
    .select('patch_number')
    .eq('user_id', user.id)
    .order('patch_number', { ascending: false })
    .limit(1)

  const nextNumber = existing && existing.length > 0 ? existing[0].patch_number + 1 : 1

  const { data: newPatch, error: patchError } = await supabase
    .from('patches')
    .insert({
      user_id: user.id,
      patch_number: nextNumber,
      name: `Copy of ${source.name}`,
      patch_limit: source.patch_limit,
      column_order: source.column_order ?? null,
      sort_order: nextNumber,
    })
    .select()
    .single()

  if (patchError || !newPatch) return { data: null, error: 'errors.generic' }

  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('patch_id', patchId)
    .eq('user_id', user.id)
    .order('trade_number', { ascending: true })

  if (trades && trades.length > 0) {
    await supabase.from('trades').insert(
      trades.map(({ id, created_at, updated_at, patch_id, ...trade }) => ({
        ...trade,
        patch_id: newPatch.id,
      }))
    )
  }

  revalidatePath('/trades')
  return { data: newPatch as Patch, error: null }
}

export async function deletePatch(patchId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('patches')
    .delete()
    .eq('id', patchId)
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function getPatchTrades(
  patchId: string
): Promise<{ data: RawTrade[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'errors.unauthorized' }

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('patch_id', patchId)
    .eq('user_id', user.id)
    .neq('is_draft', true)
    .order('sort_order', { ascending: true })

  if (error) return { data: [], error: 'errors.generic' }
  return { data: (data ?? []) as RawTrade[], error: null }
}

export async function getPatchDraftTrades(
  patchId: string
): Promise<{ data: RawTrade[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'errors.unauthorized' }

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('patch_id', patchId)
    .eq('user_id', user.id)
    .eq('is_draft', true)
    .order('sort_order', { ascending: true })

  if (error) return { data: [], error: 'errors.generic' }
  return { data: (data ?? []) as RawTrade[], error: null }
}

export async function createDraftTrade(
  patchId: string,
  sortOrder?: number,
): Promise<{ data: RawTrade | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  const { data: existing } = await supabase
    .from('trades')
    .select('trade_number, sort_order')
    .eq('patch_id', patchId)
    .order('trade_number', { ascending: false })
    .limit(1)

  const nextNumber = existing && existing.length > 0 ? existing[0].trade_number + 1 : 1
  const maxSortOrder = existing && existing.length > 0 ? (existing[0].sort_order as number) : 0
  const resolvedSortOrder = sortOrder ?? maxSortOrder + 1.0

  const now = new Date()
  const trade_date = now.toISOString().split('T')[0]
  const trade_time = now.toTimeString().slice(0, 8)

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      patch_id: patchId,
      trade_number: nextNumber,
      sort_order: resolvedSortOrder,
      trade_date,
      trade_time,
      ticker: '',
      direction: 'long',
      order_type: 'market',
      avg_entry: 0,
      stop_loss: 0,
      avg_exit: 0,
      risk: 0,
      rules_followed: false,
      setup_type: '',
      is_draft: true,
      draft_fields: [],
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: 'errors.generic' }
  return { data: data as RawTrade, error: null }
}

export async function patchTrade(
  tradeId: string,
  fields: Partial<TradeFormData>
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const updateData: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }
  if (typeof fields.trade_time === 'string' && fields.trade_time.length === 5) {
    updateData.trade_time = fields.trade_time + ':00'
  }

  const { error } = await supabase
    .from('trades')
    .update(updateData)
    .eq('id', tradeId)
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  return { error: null }
}

export async function addTrade(
  patchId: string,
  formData: TradeFormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { data: existing } = await supabase
    .from('trades')
    .select('trade_number')
    .eq('patch_id', patchId)
    .order('trade_number', { ascending: false })
    .limit(1)

  const nextNumber = existing && existing.length > 0 ? existing[0].trade_number + 1 : 1

  // Convert HH:MM to HH:MM:SS for DB time column
  const trade_time = formData.trade_time.length === 5
    ? formData.trade_time + ':00'
    : formData.trade_time

  const { error } = await supabase.from('trades').insert({
    user_id: user.id,
    patch_id: patchId,
    trade_number: nextNumber,
    ...formData,
    trade_time,
  })

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function updateTrade(
  tradeId: string,
  formData: TradeFormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const trade_time = formData.trade_time.length === 5
    ? formData.trade_time + ':00'
    : formData.trade_time

  const { error } = await supabase
    .from('trades')
    .update({ ...formData, trade_time, updated_at: new Date().toISOString() })
    .eq('id', tradeId)
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function deleteTrade(tradeId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase.from('trades').delete().eq('id', tradeId).eq('user_id', user.id)
  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function duplicateTrade(tradeId: string): Promise<{ data: RawTrade | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  const { data: source } = await supabase
    .from('trades')
    .select('*')
    .eq('id', tradeId)
    .eq('user_id', user.id)
    .single()

  if (!source) return { data: null, error: 'errors.generic' }

  const { data: existing } = await supabase
    .from('trades')
    .select('trade_number')
    .eq('patch_id', source.patch_id)
    .order('trade_number', { ascending: false })
    .limit(1)

  const nextNumber = existing && existing.length > 0 ? existing[0].trade_number + 1 : 1

  const { id: _id, created_at: _ca, updated_at: _ua, trade_number: _tn, ...rest } = source
  const { data, error } = await supabase
    .from('trades')
    .insert({ ...rest, trade_number: nextNumber, user_id: user.id })
    .select()
    .single()

  if (error) return { data: null, error: 'errors.generic' }
  revalidatePath('/trades')
  return { data: data as RawTrade, error: null }
}

export async function getColumnSettings(): Promise<ColumnSetting[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('column_settings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (data ?? []) as ColumnSetting[]
}

export async function createColumnSetting(input: {
  name: string
  description?: string
  format_type: FormatType
}): Promise<{ data: ColumnSetting | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  const column_id = `custom_${crypto.randomUUID()}`

  const { data, error } = await supabase
    .from('column_settings')
    .insert({
      user_id: user.id,
      column_id,
      name: input.name,
      description: input.description || null,
      format_type: input.format_type,
    })
    .select()
    .single()

  if (error) return { data: null, error: 'errors.generic' }
  revalidatePath('/trades')
  return { data: data as ColumnSetting, error: null }
}

export async function updateColumnSetting(
  columnId: string,
  input: { name: string; description?: string; format_type: FormatType }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('column_settings')
    .update({
      name: input.name,
      description: input.description || null,
      format_type: input.format_type,
      updated_at: new Date().toISOString(),
    })
    .eq('column_id', columnId)
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function saveColumnVisibility(
  visibility: Record<string, boolean>
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('patches')
    .update({ column_visibility: visibility })
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  return { error: null }
}

export async function saveColumnOrderGlobal(
  order: string[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('patches')
    .update({ column_order: order })
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  return { error: null }
}

export async function deleteColumnSetting(columnId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('column_settings')
    .delete()
    .eq('column_id', columnId)
    .eq('user_id', user.id)

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function upsertColumnSetting(input: {
  column_id: string
  name: string
  description?: string
  format_type: FormatType
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthorized' }

  const { error } = await supabase
    .from('column_settings')
    .upsert({
      user_id: user.id,
      column_id: input.column_id,
      name: input.name,
      description: input.description || null,
      format_type: input.format_type,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,column_id' })

  if (error) return { error: 'errors.generic' }
  revalidatePath('/trades')
  return { error: null }
}

export async function getColumnOptions(): Promise<Record<string, ColumnOption[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data } = await supabase
    .from('column_options')
    .select('*')
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (!data || data.length === 0) return {}

  const grouped: Record<string, ColumnOption[]> = {}
  for (const row of data as ColumnOption[]) {
    if (!grouped[row.column_id]) grouped[row.column_id] = []
    grouped[row.column_id].push(row)
  }
  return grouped
}

export async function saveColumnOptions(
  columnId: string,
  options: { value: string; label: string }[]
): Promise<{ data: ColumnOption[] | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'errors.unauthorized' }

  await supabase
    .from('column_options')
    .delete()
    .eq('user_id', user.id)
    .eq('column_id', columnId)

  if (options.length === 0) return { data: [], error: null }

  const rows = options.map((opt, i) => ({
    user_id: user.id,
    column_id: columnId,
    value: opt.value,
    label: opt.label,
    position: i,
  }))

  const { data, error } = await supabase
    .from('column_options')
    .insert(rows)
    .select()

  if (error) return { data: null, error: 'errors.generic' }
  return { data: data as ColumnOption[], error: null }
}
