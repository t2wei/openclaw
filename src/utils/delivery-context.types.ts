import type { ChannelRouteTargetInput } from "../plugin-sdk/channel-route.js";

export type DeliveryIntentRef = {
  id: string;
  kind: "outbound_queue";
  queuePolicy?: "required" | "best_effort";
};

export type DeliveryContext = Pick<
  ChannelRouteTargetInput,
  "accountId" | "channel" | "threadId" | "to"
> & {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  /** Channel-specific reply target ID (e.g. Feishu om_ message_id for topic reply). */
  replyTargetId?: string;
  deliveryIntent?: DeliveryIntentRef;
};

export type DeliveryContextSessionSource = {
  channel?: string;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  origin?: {
    provider?: string;
    accountId?: string;
    threadId?: string | number;
  };
  deliveryContext?: DeliveryContext;
};
