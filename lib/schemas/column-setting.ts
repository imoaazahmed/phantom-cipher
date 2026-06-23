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
  formula_id: yup
    .string()
    .nullable()
    .default(null)
    .when('is_formula', {
      is: true,
      then: (s) =>
        s
          .required('trades.formula.errorVariableIdRequired')
          .matches(
            /^[a-zA-Z_][a-zA-Z0-9_]*$/,
            'trades.formula.errorVariableIdFormat'
          ),
    }),
})

export type ColumnSettingFormData = yup.InferType<typeof columnSettingSchema>
