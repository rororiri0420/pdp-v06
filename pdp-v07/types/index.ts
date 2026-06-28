// PDP v0.7 Insight OS — shared types

export type AuthorVoiceMode = 'raw' | 'polished' | 'editorial';
export type WorkflowStatus = 'draft' | 'published' | 'archived';
export type BillingMode = 'user_api_key' | 'owner_promo';

export interface BillingResult {
  claudeKey: string;
  billingMode: BillingMode;
  promoCode?: string;
  remaining?: number;
}
