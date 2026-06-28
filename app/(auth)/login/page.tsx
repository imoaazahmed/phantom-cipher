"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import { useQueryState } from "nuqs"
import { login } from "@/lib/auth/actions"
import { loginSchema, type LoginFormValues } from "@/lib/schemas/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function LoginPage() {
  const { t } = useTranslation()
  const [errorParam] = useQueryState("error")
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: yupResolver(loginSchema) })

  async function onSubmit(data: LoginFormValues) {
    const result = await login(data)
    if (result?.error) {
      setError("root", { message: result.error })
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.description")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="flex flex-col gap-4">
          {(errors.root || errorParam === "auth_callback_failed") && (
            <p className="text-sm text-destructive">
              {errors.root
                ? t(errors.root.message!, { defaultValue: errors.root.message })
                : t("errors.authCallbackFailed")}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{t(errors.email.message!)}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("auth.login.forgotPassword")}
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{t(errors.password.message!)}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 mt-(--card-spacing)">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.login.noAccount")}{" "}
            <Link href="/signup" className="text-foreground hover:underline">
              {t("auth.login.signupLink")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
