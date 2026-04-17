// Auth token stored in module-level variable (React state in App drives re-renders)
let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
}
