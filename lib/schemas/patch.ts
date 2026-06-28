import * as yup from 'yup'

export const patchNameSchema = yup.object({
  name: yup.string().trim().required('trades.patches.nameRequired'),
})

export const patchLimitSchema = yup.object({
  patch_limit: yup
    .string()
    .required('trades.patches.limitRequired')
    .matches(/^\d+$/, 'trades.patches.limitInvalid')
    .test('min', 'trades.patches.limitMin', (v) => parseInt(v ?? '0', 10) >= 1),
})

export const patchCreateSchema = patchNameSchema.concat(patchLimitSchema)

export type PatchNameSchema = yup.InferType<typeof patchNameSchema>
export type PatchLimitSchema = yup.InferType<typeof patchLimitSchema>
export type PatchCreateSchema = yup.InferType<typeof patchCreateSchema>
