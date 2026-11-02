// ─────────────────────────────────────────────────────────────
//  integrations/elasticsearch.ts
//  Elasticsearch adapter for indexing/searching emails.
//
//  Pattern: Adapter — wraps ES client behind a clean interface.
//
//  Resilience rule: ES failures MUST NOT break email delivery.
//  All methods catch their own errors and log warnings.
//
//  Index structure: one index "emails" with mappings for all fields.
// ─────────────────────────────────────────────────────────────

import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { EmailSearchParams, EmailSearchResult, EmailStatus } from "../types";

const INDEX = env.ELASTICSEARCH_INDEX_EMAILS;

// ── Index Mappings ─────────────────────────────────────────────
const INDEX_MAPPINGS = {
  mappings: {
    properties: {
      id:          { type: "keyword" },
      userId:      { type: "keyword" },
      campaignId:  { type: "keyword" },
      senderId:    { type: "keyword" },
      senderEmail: { type: "keyword" },
      recipient:   { type: "keyword" },
      subject:     { type: "text", analyzer: "standard", fields: { keyword: { type: "keyword" } } },
      body:        { type: "text", analyzer: "standard" },
      status:      { type: "keyword" },
      scheduledAt: { type: "date" },
      sentAt:      { type: "date" },
      createdAt:   { type: "date" },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
};

export class ElasticsearchService {
  private client: Client;
  private ready = false;

  constructor() {
    this.client = new Client({ node: env.ELASTICSEARCH_URL });
  }

  /** Initialize: create index if it doesn't exist. */
  async initialize(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: INDEX });
      if (!exists) {
        await this.client.indices.create({ index: INDEX, ...INDEX_MAPPINGS });
        logger.info(`[ES] Created index: ${INDEX}`);
      } else {
        logger.info(`[ES] Index already exists: ${INDEX}`);
      }
      this.ready = true;
    } catch (err) {
      logger.warn(`[ES] Could not initialize — search will be unavailable`, { error: err });
    }
  }

  /** Index or update a single email document. */
  async indexEmail(email: {
    id: string;
    userId: string;
    campaignId?: string | null;
    senderId: string;
    senderEmail?: string;
    recipient: string;
    subject: string;
    body: string;
    status: EmailStatus;
    scheduledAt: Date;
    sentAt?: Date | null;
    createdAt: Date;
  }): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.index({
        index: INDEX,
        id: email.id,
        document: {
          ...email,
          scheduledAt: email.scheduledAt.toISOString(),
          sentAt: email.sentAt?.toISOString() ?? null,
          createdAt: email.createdAt.toISOString(),
        },
      });
    } catch (err) {
      logger.warn(`[ES] Failed to index email ${email.id}`, { error: err });
    }
  }

  /** Update email status in the index. */
  async updateEmailStatus(
    emailId: string,
    status: EmailStatus,
    sentAt?: Date
  ): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.update({
        index: INDEX,
        id: emailId,
        doc: {
          status,
          sentAt: sentAt?.toISOString() ?? null,
        },
      });
    } catch (err) {
      logger.warn(`[ES] Failed to update email ${emailId}`, { error: err });
    }
  }

  /** Full-text search across recipient, subject, body. */
  async searchEmails(params: EmailSearchParams): Promise<{
    results: EmailSearchResult[];
    total: number;
  }> {
    if (!this.ready) return { results: [], total: 0 };

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const from = (page - 1) * limit;

    const must: object[] = [
      { term: { userId: params.userId } },
    ];

    if (params.status) must.push({ term: { status: params.status } });
    if (params.query) {
      must.push({
        multi_match: {
          query: params.query,
          fields: ["subject^2", "body", "recipient"],
        },
      });
    }

    const dateFilter: object[] = [];
    if (params.from) dateFilter.push({ range: { scheduledAt: { gte: params.from } } });
    if (params.to)   dateFilter.push({ range: { scheduledAt: { lte: params.to } } });

    try {
      const response = await this.client.search({
        index: INDEX,
        from,
        size: limit,
        query: {
          bool: {
            must,
            filter: dateFilter,
          },
        },
        sort: [{ scheduledAt: { order: "desc" } }],
      });

      const hits = response.hits.hits;
      const results: EmailSearchResult[] = hits.map((hit) => {
        const src = hit._source as EmailSearchResult;
        return { ...src, id: hit._id! };
      });

      const total =
        typeof response.hits.total === "number"
          ? response.hits.total
          : response.hits.total?.value ?? 0;

      return { results, total };
    } catch (err) {
      logger.warn(`[ES] Search failed`, { error: err });
      return { results: [], total: 0 };
    }
  }
}

export const elasticsearchService = new ElasticsearchService();

