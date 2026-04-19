export interface RecipeIngredient {
  id?: number;
  recipeId?: number;
  sortOrder?: number;
  ingredientName: string;
  itemNumber: string | null;
  recipeQuantity: number;
  recipeUnit: string;
  unitCost: number;
  ingredientCost: number;
  lineItemId: number | null;
}

export interface Recipe {
  id: number;
  restaurantId: number;
  name: string;
  classification: string | null;
  standardPortion: string | null;
  standardYield: number;
  methodOfPreparation: string | null;
  platingInstructions: string | null;
  photoUrl: string | null;
  notes: string | null;
  desiredCostPct: number;
  actualMenuPrice: number;
  qFactor: number;
  allergens: string[];
  createdAt: string;
  updatedAt: string;
  ingredients?: RecipeIngredient[];
}

export const ALLERGENS = [
  "Gluten", "Dairy", "Eggs", "Fish", "Shellfish",
  "Tree Nuts", "Peanuts", "Soy", "Sesame", "Mustard",
];

export const CLASSIFICATIONS = [
  "Appetizer", "Soup", "Salad", "Entrée", "Side",
  "Dessert", "Beverage", "Sauce", "Other",
];

export const UNITS = [
  "oz", "lb", "g", "kg", "fl oz", "cup", "qt", "gal",
  "tsp", "tbsp", "each", "bunch", "slice", "portion", "pkg",
];

export interface IngredientSuggestion {
  id: number;
  name: string;
  unit: string;
  unitCost: number;
  packSize: number | null;
  packUnit: string | null;
}
