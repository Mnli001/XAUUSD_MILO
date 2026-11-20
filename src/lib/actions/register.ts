"use server";
import { createUser } from "../users";

export async function registerUser(form: FormData): Promise<{ error?: string }> {
  return createUser({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
}
