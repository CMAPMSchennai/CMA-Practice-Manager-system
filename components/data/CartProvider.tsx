"use client";

/**
 * Platform-provided client-side cart — do NOT edit unless customizing. A small
 * in-memory cart (count + items) for website templates; no server round-trip.
 * `AddToCartButton` adds an item and toasts; `CartCounter` renders the count.
 */
import * as React from "react";
import { toast } from "sonner";

interface CartItem {
  id: string;
  label: string;
  price?: string;
}
interface CartContextValue {
  items: CartItem[];
  count: number;
  add: (item: CartItem) => void;
  clear: () => void;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const value: CartContextValue = {
    items,
    count: items.length,
    add: (item) => setItems((prev) => [...prev, item]),
    clear: () => setItems([]),
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}

export function AddToCartButton(props: {
  item: CartItem;
  successToast?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const cart = React.useContext(CartContext);
  return (
    <button
      type="button"
      className={props.className}
      onClick={() => {
        cart?.add(props.item);
        toast.success(props.successToast ?? `Added ${props.item.label} to cart`);
      }}
    >
      {props.children}
    </button>
  );
}

export function CartCounter(props: { className?: string; label?: string }) {
  const cart = React.useContext(CartContext);
  return (
    <span className={props.className}>
      {props.label ?? "Cart"} ({cart?.count ?? 0})
    </span>
  );
}
