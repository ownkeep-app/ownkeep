export const PASSWORDS_MODULE_ID = "passwords";
export const PASSWORD_SECRET_FIELD = "password";
export const MASKED_PASSWORD = "********";

export interface PasswordEntry {
  id: string;
  name: string;
  username: string;
  password?: string;
  loginUrl: string;
  recoveryUrl: string;
  notes: string;
  category: string;
  updatedAt: string;
}

export interface PasswordFormInput {
  name: string;
  username: string;
  password: string;
  loginUrl: string;
  recoveryUrl: string;
  notes: string;
  category: string;
}
