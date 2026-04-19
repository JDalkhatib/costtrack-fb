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
  // Persist for use in non-React contexts (recipe form ingredient search)
  localStorage.setItem("auth_token", token);
  if (restaurantId !== null) localStorage.setItem("restaurant_id", String(restaurantId));
  else localStorage.removeItem("restaurant_id");
}

export function clearAuth() {
  _token = null;
  _isAdmin = false;
  _restaurantId = null;
  _restaurantName = null;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("restaurant_id");
}

export function getIsAdmin(): boolean { return _isAdmin; }
export function getRestaurantId(): number | null { return _restaurantId; }
export function getRestaurantName(): string | null { return _restaurantName; }
