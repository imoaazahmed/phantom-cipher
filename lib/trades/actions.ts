// lib/trades/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Patch, RawTrade, TradeFormData, ColumnSetting, FormatType } from './types'

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
  updates: Partial<{ name: string; patch_limit: number; is_hidden: boolean; sort_order: number; column_order: string[] | null }>
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
    .order('trade_number', { ascending: true })

  if (error) return { data: [], error: 'errors.generic' }
  return { data: (data ?? []) as RawTrade[], error: null }
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
