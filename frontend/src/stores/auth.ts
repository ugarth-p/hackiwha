import { create } from "zustand"

type AuthState = {
  isAuthenticated: boolean
  user: { email: string; name: string } | null
  login: (email: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  login: (email: string) =>
    set({
      isAuthenticated: true,
      user: { email, name: email.split("@")[0] },
    }),
  logout: () =>
    set({
      isAuthenticated: false,
      user: null,
    }),
}))
