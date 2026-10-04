/**
 * /api/requests/meta/form — فرم پویای دسته‌بندی درخواست (گام ۳)
 * ------------------------------------------------------
 * GET ?tradeType=&buildingType=&propertyType=
 * پروکسی زنده به forms/info/category?type=request_property خود سامانه آرم (عمومی — تست زنده ۲۰۰).
 * خروجی: ورودی‌های دسته (infos غیرچک‌باکسی + options چک‌باکسی) عین خود سامانه:
 *   هر ورودی {nameFa, nameEn, request: {inputType, createName, createNameFrom/To, createRange,
 *   unit, createOptions, createPlaceholder…}}
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";

interface ArmFormInput {
  _id: string;
  nameFa?: string;
  nameEn?: string;
  request?: {
    inputType?: string;
    createName?: string;
    createNameFrom?: string;
    createNameTo?: string;
    createType?: string;
    createRange?: boolean;
    unit?: string;
    createOptions?: { label?: string; value?: string; name?: string }[];
    createPlaceholder?: string;
    createPlaceholderFrom?: string;
    createPlaceholderTo?: string;
    help?: string;
  };
  help?: string;
}

/** ورودی نرمال‌شده برای UI */
export interface FormField {
  id: string;
  nameFa: string;
  nameEn: string;
  inputType: "text" | "number" | "dropdown" | "multi_select_dropdown" | "switch" | "checkbox";
  createName: string;
  createNameFrom?: string;
  createNameTo?: string;
  createRange: boolean;
  unit?: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  placeholderFrom?: string;
  placeholderTo?: string;
  help?: string;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const url = new URL(request.url);
  const tradeType = url.searchParams.get("tradeType") ?? "";
  const buildingType = url.searchParams.get("buildingType") ?? "";
  const propertyType = url.searchParams.get("propertyType") ?? "";

  if (!tradeType || !buildingType || !propertyType) {
    return Response.json({
      ok: true,
      fields: [] as FormField[],
      formName: null,
      message: "برای دریافت فرم دسته‌بندی، هر سه نوع (معامله/کاربری/ملک) را انتخاب کنید — عین خود سامانه.",
    });
  }

  try {
    const res = await armCall<{ _id?: string; name?: string; inputs?: ArmFormInput[] }>({
      method: "GET",
      path: "forms/info/category",
      baseUrl: getMelkApiConfig().armApiBase,
      query: { tradeType, buildingType, propertyType, type: "request_property" },
      timeoutMs: 20000,
      maxRetries: 2,
    });
    const data = res.data;
    const raw = Array.isArray(data?.inputs) ? data!.inputs! : [];

    // تفکیک عین خود سامانه: options = چک‌باکس‌ها (امکانات)، infos = بقیه (مشخصات)
    const normalize = (i: ArmFormInput): FormField => ({
      id: i._id,
      nameFa: i.nameFa ?? i.nameEn ?? "—",
      nameEn: i.nameEn ?? "",
      inputType: (i.request?.inputType as FormField["inputType"]) ?? "text",
      createName: i.request?.createName ?? i.nameEn ?? "",
      createNameFrom: i.request?.createNameFrom,
      createNameTo: i.request?.createNameTo,
      createRange: Boolean(i.request?.createRange),
      unit: i.request?.unit,
      options: (i.request?.createOptions ?? []).map((o) => ({
        label: o.label ?? o.name ?? o.value ?? "—",
        value: o.value ?? o.label ?? o.name ?? "—",
      })),
      placeholder: i.request?.createPlaceholder,
      placeholderFrom: i.request?.createPlaceholderFrom,
      placeholderTo: i.request?.createPlaceholderTo,
      help: i.help ?? i.request?.help,
    });

    const fields = raw
      .filter((i) => i.request?.inputType !== "break")
      .map(normalize)
      .filter((f) => Boolean(f.createName));
    const infos = fields.filter((f) => f.inputType !== "checkbox");
    const options = fields.filter((f) => f.inputType === "checkbox");

    return Response.json({
      ok: true,
      formName: data?.name ?? null,
      infos,
      options,
      fields,
      message: `فرم «${data?.name ?? "دسته‌بندی"}» با ${infos.length} مشخصه و ${options.length} امکان زنده دریافت شد (عین خود سامانه).`,
    });
  } catch (err) {
    // HOTFIX-04 (B7): پاسخ خطا باید statusCode خطا بدهد (502 دروازه بالادستی)،
    // نه 200 با ok:false — کلاینت‌های استاندارد retry/گزارش را از کد وضعیت می‌خوانند.
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای دریافت فرم", 502, false);
    return Response.json(
      {
        ok: false,
        fields: [] as FormField[],
        infos: [] as FormField[],
        options: [] as FormField[],
        formName: null,
        message:
          e.message ??
          "فرم دسته‌بندی از سامانه آرم دریافت نشد — می‌توانید بدون فرم پویا ادامه دهید و بعداً تکمیل کنید.",
        error: e.message,
      },
      { status: 502 }
    );
  }
}
