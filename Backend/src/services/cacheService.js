const crypto = require("crypto");
const logger = require("../utils/logger");

class CacheService {
    /**
     * @param {Object} options
     * @param {number} [options.maxSize=5000] Maximum number of keys in cache
     * @param {number} [options.defaultTtl=60] Default TTL in seconds
     */
    constructor(options = {}) {
        this.maxSize = options.maxSize || 5000;
        this.defaultTtl = options.defaultTtl || 60;
        /** @type {Map<string, { value: any, expiresAt: number, tags: Set<string>, etag: string, contentType: string }>} */
        this.cache = new Map();
        /** @type {Map<string, Set<string>>} tag -> Set of keys */
        this.tagToKeys = new Map();
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
    }

    /**
     * Computes strong ETag for a given payload.
     * @param {string|Buffer} body
     * @returns {string} ETag with quotes e.g. '"hash"'
     */
    generateETag(body) {
        const hash = crypto
            .createHash("sha1")
            .update(typeof body === "string" ? body : JSON.stringify(body))
            .digest("base64url");
        return `"${hash}"`;
    }

    /**
     * Get a cached entry.
     * @param {string} key
     * @returns {{ value: any, etag: string, contentType: string } | null}
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.misses++;
            return null;
        }

        const now = Date.now();
        if (entry.expiresAt && now > entry.expiresAt) {
            this.delete(key);
            this.misses++;
            return null;
        }

        // LRU order: delete and re-insert key to mark as most recently used
        this.cache.delete(key);
        this.cache.set(key, entry);

        this.hits++;
        return {
            value: entry.value,
            etag: entry.etag,
            contentType: entry.contentType,
        };
    }

    /**
     * Store an entry in cache with optional TTL and tags.
     * @param {string} key
     * @param {any} value
     * @param {Object} [options]
     * @param {number} [options.ttlSeconds]
     * @param {string[]} [options.tags]
     * @param {string} [options.contentType='application/json']
     * @returns {string} ETag generated for this entry
     */
    set(key, value, options = {}) {
        const ttlSeconds = options.ttlSeconds !== undefined ? options.ttlSeconds : this.defaultTtl;
        const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
        const tags = new Set(options.tags || []);
        const contentType = options.contentType || "application/json";
        const etag = this.generateETag(value);

        // If key already exists, clean up old tag mappings
        if (this.cache.has(key)) {
            const oldEntry = this.cache.get(key);
            if (oldEntry && oldEntry.tags) {
                for (const tag of oldEntry.tags) {
                    const keysSet = this.tagToKeys.get(tag);
                    if (keysSet) {
                        keysSet.delete(key);
                        if (keysSet.size === 0) {
                            this.tagToKeys.delete(tag);
                        }
                    }
                }
            }
            this.cache.delete(key);
        }

        // Enforce max size via LRU eviction (first item in Map is oldest)
        while (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.delete(oldestKey);
                this.evictions++;
            } else {
                break;
            }
        }

        // Store new entry
        this.cache.set(key, {
            value,
            expiresAt,
            tags,
            etag,
            contentType,
        });

        // Register tags
        for (const tag of tags) {
            if (!this.tagToKeys.has(tag)) {
                this.tagToKeys.set(tag, new Set());
            }
            this.tagToKeys.get(tag).add(key);
        }

        return etag;
    }

    /**
     * Delete a single key and clean up tag references.
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;

        if (entry.tags) {
            for (const tag of entry.tags) {
                const keysSet = this.tagToKeys.get(tag);
                if (keysSet) {
                    keysSet.delete(key);
                    if (keysSet.size === 0) {
                        this.tagToKeys.delete(tag);
                    }
                }
            }
        }

        return this.cache.delete(key);
    }

    /**
     * Invalidate all cache entries associated with one or more tags.
     * @param {string|string[]} tags
     * @returns {number} count of invalidated keys
     */
    invalidateTags(tags) {
        const tagList = Array.isArray(tags) ? tags : [tags];
        let count = 0;
        const keysToDelete = new Set();

        for (const tag of tagList) {
            const keys = this.tagToKeys.get(tag);
            if (keys) {
                for (const key of keys) {
                    keysToDelete.add(key);
                }
                this.tagToKeys.delete(tag);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
            count++;
        }

        if (count > 0) {
            logger.debug("cache", "Invalidated cache tags", {
                tags: tagList,
                invalidatedKeysCount: count,
            });
        }

        return count;
    }

    /**
     * Clear all cached items.
     */
    clear() {
        this.cache.clear();
        this.tagToKeys.clear();
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
    }

    /**
     * Get cache diagnostics.
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            tagCount: this.tagToKeys.size,
            hits: this.hits,
            misses: this.misses,
            evictions: this.evictions,
            hitRate: this.hits + this.misses > 0
                ? Number((this.hits / (this.hits + this.misses)).toFixed(4))
                : 0,
        };
    }
}

// Export singleton instance + class
const defaultCacheService = new CacheService();
defaultCacheService.CacheService = CacheService;

module.exports = defaultCacheService;
