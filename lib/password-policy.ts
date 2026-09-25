export const PASSWORD_REQUIREMENTS = "Your password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*-)."

export function validatePassword(password: string) {
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*\-]/.test(password)) {
    throw new Error(PASSWORD_REQUIREMENTS)
  }
}
