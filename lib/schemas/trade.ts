// lib/schemas/trade.ts
import * as yup from 'yup'

export const tradeSchema = yup.object({
  trade_date: yup.string().required('validation.trades.dateRequired'),
  trade_time: yup.string().required('validation.trades.timeRequired'),
  ticker: yup.string().required('validation.trades.tickerRequired'),
  direction: yup
    .mixed<'long' | 'short'>()
    .oneOf(['long', 'short'] as const, 'validation.trades.directionRequired')
    .required('validation.trades.directionRequired'),
  order_type: yup
    .mixed<'market' | 'limit'>()
    .oneOf(['market', 'limit'] as const, 'validation.trades.orderTypeRequired')
    .required('validation.trades.orderTypeRequired'),
  avg_entry: yup
    .number()
    .typeError('validation.trades.avgEntryRequired')
    .positive('validation.trades.avgEntryPositive')
    .required('validation.trades.avgEntryRequired'),
  stop_loss: yup
    .number()
    .typeError('validation.trades.stopLossRequired')
    .positive('validation.trades.stopLossPositive')
    .required('validation.trades.stopLossRequired')
    .test('stop-loss-direction', '', function (value) {
      const { direction, avg_entry } = this.parent as {
        direction: string
        avg_entry: number
      }
      if (!value || !avg_entry || !direction) return true
      if (direction === 'long' && value >= avg_entry)
        return this.createError({ message: 'validation.trades.stopLossLong' })
      if (direction === 'short' && value <= avg_entry)
        return this.createError({ message: 'validation.trades.stopLossShort' })
      return true
    }),
  avg_exit: yup
    .number()
    .typeError('validation.trades.avgExitRequired')
    .positive('validation.trades.avgExitPositive')
    .required('validation.trades.avgExitRequired'),
  risk: yup
    .number()
    .typeError('validation.trades.riskRequired')
    .positive('validation.trades.riskPositive')
    .required('validation.trades.riskRequired'),
  rules_followed: yup.boolean().required().default(true),
  setup_type: yup.string().required('validation.trades.setupTypeRequired'),
})

export type TradeSchema = yup.InferType<typeof tradeSchema>
