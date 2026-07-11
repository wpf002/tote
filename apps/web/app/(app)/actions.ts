"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, setSelectedEntityId } from "@/lib/auth";

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function switchEntity(formData: FormData): Promise<void> {
  const id = String(formData.get("legalEntityId") ?? "");
  if (id) setSelectedEntityId(id);
  revalidatePath("/", "layout");
}
