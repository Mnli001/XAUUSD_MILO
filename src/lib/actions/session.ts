"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "../auth";
import { registerUser } from "./register";

export type FormState = { error?: string };

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirectTo: "/today" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Имэйл эсвэл нууц үг буруу байна" };
    throw e; // redirect
  }
  return {};
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const r = await registerUser(form);
  if (r.error) return r;
  return loginAction({}, form);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
