// Auth store — module-level (React state in App drives re-renders)
let _token: string | null = null;
let _isAdmin = false;
let _restaurantId: number | null = null;
let _restaurantName: string | null = null;

export function setAuthToken(token: string | null) { _token = token; }
export function getAuthToken(): string | null { return _token; }

export function setAuth(
  token: string,
  isAdmin: boolean,
  restaurantId: number | null,
  restaurantName: string | null
) {
  _token = token;
  _isAdmin = isAdmin;
  _restaurantId = restaurantId;
  _restaurantName = restaurantName;
}

export function clearAuth() {
  _token = null;
  _isAdmin = false;
  _restaurantId = null;
  _restaurantName = null;
}

export function getIsAdmin(): boolean { return _isAdmin; }
export function getRestaurantId(): number | null { return _restaurantId; }
export function getRestaurantName(): string | null { return _restaurantName; }
