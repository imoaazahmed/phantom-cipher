import * as yup from 'yup'
import { FORMAT_TYPES } from '@/lib/trades/types'

export const columnSettingSchema = yup.object({
  name: yup.string().trim().required('validation.columnSetting.nameRequired'),
  description: yup.string().trim().optional().default(''),
  format_type: yup
    .string()
    .oneOf([...FORMAT_TYPES])
    .default('auto'),
  is_formula: yup.boolean().default(false),
  formula: yup.string().nullable().default(null),
  column_id: yup
    .string()
    .nullable()
    .default(null),
})

export type ColumnSettingFormData = yup.InferType<typeof columnSettingSchema>
