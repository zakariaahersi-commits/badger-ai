// @layers/core-wasm 3.1.2's browser export omits the standard-event helpers
// that @layers/client statically re-exports. The SDK client does not use these
// helpers for LayersClient.track(), but Webpack still validates every named
// import. Re-export the real browser core and provide the omitted pure helpers
// until the upstream package fixes its browser export map.
export * from "@layers/core-wasm/browser";

type EventPayload = { event: string; properties: Record<string, unknown> };
type EventInput = Record<string, unknown>;

export const LayersEvent = {
  ADD_TO_CART: "add_to_cart",
  BEGIN_CHECKOUT: "begin_checkout",
  PURCHASE: "purchase_success",
  REFUND: "refund",
  START_TRIAL: "start_trial",
  SUBSCRIBE: "subscribe",
  VIEW_ITEM: "view_item",
} as const;

function payload(event: string, input: EventInput = {}): EventPayload {
  return { event, properties: { ...input } };
}

export const addToCartEvent = (input: EventInput = {}) => payload(LayersEvent.ADD_TO_CART, input);
export const beginCheckoutEvent = (input: EventInput = {}) => payload(LayersEvent.BEGIN_CHECKOUT, input);
export const purchaseEvent = (input: EventInput = {}) => payload(LayersEvent.PURCHASE, input);
export const refundEvent = (input: EventInput = {}) => payload(LayersEvent.REFUND, input);
export const startTrialEvent = (input: EventInput = {}) => payload(LayersEvent.START_TRIAL, input);
export const subscribeEvent = (input: EventInput = {}) => payload(LayersEvent.SUBSCRIBE, input);
export const viewItemEvent = (input: EventInput = {}) => payload(LayersEvent.VIEW_ITEM, input);
