function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 100, allLimit = 5000 } = {}) {
    if (query && (query.all === "true" || query.all === true)) {
        return { page: 1, limit: allLimit, skip: 0, all: true };
    }

    const page = Math.max(1, parseInt(query?.page, 10) || 1);
    const requested = parseInt(query?.limit, 10);

    // Member search and reports ask for the full set (limit >= 1000).
    // A hard cap of 100 kept only the oldest page, so newly added people
    // never appeared in those filters.
    if (Number.isFinite(requested) && requested >= 1000) {
        const limit = Math.min(allLimit, requested);
        return { page: 1, limit, skip: 0, all: true };
    }

    const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(requested) ? requested : defaultLimit));
    return { page, limit, skip: (page - 1) * limit, all: false };
}

function buildPagination(page, limit, total) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
}

module.exports = { parsePagination, buildPagination };
