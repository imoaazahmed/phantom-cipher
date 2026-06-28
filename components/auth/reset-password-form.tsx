"use client"

import { useTranslation } from "react-i18next"
import { useForm, useWatch } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import { resetPassword } from "@/lib/auth/actions"
import { resetPasswordSchema, type ResetPasswordFormValues } from "@/lib/schemas/auth"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordStrength } from "@/components/ui/password-strength"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function ResetPasswordForm() {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: yupResolver(resetPasswordSchema) })

  const password = useWatch({ control, name: "password" }) ?? ""

  async function onSubmit(data: ResetPasswordFormValues) {
    const result = await resetPassword({ password: data.password })
    if (result?.error) {
      setError("root", { message: result.error })
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth.resetPassword.title")}</CardTitle>
        <CardDescription>{t("auth.resetPassword.description")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="flex flex-col gap-4">
          {errors.root && (
            <p className="text-sm text-destructive">
              {t(errors.root.message!, { defaultValue: errors.root.message })}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("auth.resetPassword.newPassword")}</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{t(errors.password.message!)}</p>
            ) : (
              <PasswordStrength password={password} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              {...register("confirm")}
            />
            {errors.confirm && (
              <p className="text-xs text-destructive">{t(errors.confirm.message!)}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="mt-(--card-spacing)">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
