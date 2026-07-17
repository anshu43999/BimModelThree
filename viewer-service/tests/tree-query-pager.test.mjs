import assert from "node:assert/strict";
import test from "node:test";

import {TreeQueryPager} from "../viewer/app/tree-query-pager.js";

test("tree query pager returns only the first page by default", () => {
    const pager = new TreeQueryPager({pageSize: 3});
    const page = pager.getPage("0", [1, 2, 3, 4, 5, 6, 7]);

    assert.deepEqual(page.items, [1, 2, 3]);
    assert.equal(page.visibleCount, 3);
    assert.equal(page.remaining, 4);
    assert.equal(page.hasMore, true);
});

test("tree query pager incrementally exposes more items per parent", () => {
    const pager = new TreeQueryPager({pageSize: 2});
    pager.loadMore("0.1", 5);
    assert.deepEqual(pager.getPage("0.1", [1, 2, 3, 4, 5]).items, [1, 2, 3, 4]);

    pager.loadMore("0.1", 5);
    const completed = pager.getPage("0.1", [1, 2, 3, 4, 5]);
    assert.deepEqual(completed.items, [1, 2, 3, 4, 5]);
    assert.equal(completed.hasMore, false);

    assert.deepEqual(pager.getPage("0.2", [7, 8, 9]).items, [7, 8]);
});

test("tree query pager reset restores first-page limits", () => {
    const pager = new TreeQueryPager({pageSize: 2});
    pager.loadMore("0", 4);
    assert.equal(pager.getPage("0", [1, 2, 3, 4]).visibleCount, 4);

    pager.reset();
    assert.equal(pager.getPage("0", [1, 2, 3, 4]).visibleCount, 2);
});
