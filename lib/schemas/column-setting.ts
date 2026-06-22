import * as yup from 'yup'
import { FORMAT_TYPES } from '@/lib/trades/types'

export const columnSettingSchema = yup.object({
  name: yup.string().trim().required('validation.columnSetting.nameRequired'),
  description: yup.string().trim().optional().default(''),
  format_type: yup
    .string()
    .oneOf([...FORMAT_TYPES])
    .default('auto'),
})

export type ColumnSettingFormData = yup.InferType<typeof columnSettingSchema>
