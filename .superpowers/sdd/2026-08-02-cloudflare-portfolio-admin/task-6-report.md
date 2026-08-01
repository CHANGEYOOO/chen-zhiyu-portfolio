# Task 6 report — accessible manual image sorting

## Delivered

- Added `admin/sortable-list.js`, a DOM-independent ordering model with immutable `moveItem`, continuous `sort_order` values, server-order snapshots, dirty tracking, cancellation, and `change` events. It owns pointer/touch drag interactions, keyboard Arrow Up/Down movement, and delegated up/down button handling, but makes no API requests.
- Integrated the sortable list only into persisted Livestream project-image rows. The first ordered image visibly carries the `封面` marker. Each row has a pointer drag handle, keyboard instructions through its accessible label, and explicit `上移` / `下移` controls with boundary disabling.
- Added local dirty presentation (`data-order-dirty`) and separate status feedback. Only the explicit `保存排序` control calls `PUT /api/admin/works/:workId/order/images`; it disables while saving, keeps the local order dirty on failure, and records the order as the new server baseline only after success. `取消排序` restores the last fetched/saved server order.
- Updated only `prototype/admin` files and admin cache-busting query values. The public portfolio frontend remains untouched.

## TDD and verification

1. Wrote `admin/tests/sortable-list.test.js` before the sorting module existed. The required initial command failed with `ERR_MODULE_NOT_FOUND` for `admin/sortable-list.js`.
2. Added tests for drag move, first/last boundaries, up/down movement, continuous ordering, cover status, dirty changes, and cancellation.
3. Final verification with the bundled Node runtime:

   ```text
   node --test admin/tests/*.test.js  17 passed, 0 failed
   node --check admin/admin.js        passed
   node --check admin/sortable-list.js passed
   git diff --check                   passed
   ```

## Self-review

- Confirmed changes never call the ordering API from pointer, keyboard, or button reordering handlers; the only caller is `saveImageOrder` bound to `保存排序`.
- Confirmed cancellation resets from the dedicated server snapshot rather than from a rendered/local draft order.
- Confirmed failure feedback does not call `commit`, so retry remains available with the selected local order intact.

## Remaining concern

No browser-level interaction run was performed in this task. The pointer implementation uses standard Pointer Events with up/down controls as the touch-safe and keyboard-accessible fallback; final deployment QA should exercise a real iOS and desktop browser.

## Review follow-up — explicit-save boundary

- `SortableList` now exposes a read-only normalized `serverItems` snapshot. Ordinary media attachment uses this snapshot plus newly uploaded images, so an unsaved local reorder cannot be persisted indirectly by the normal work-save flow.
- Extracted the one API call to `admin/image-order.js`. Only the editor's explicit `保存排序` handler invokes it; the helper commits the new server baseline only after a successful response. A rejected request leaves the local order dirty and retryable.
- Added regression tests for server-order-preserving media attachment, rejected explicit saves, and pointer/keyboard/touch-source local reorders. The pointer handler now updates its drag index before rendering so the active `aria-grabbed` state tracks the moved row.

Final verification after the follow-up:

```text
node --test admin/tests/*.test.js                    20 passed, 0 failed
node --test cloudflare-portfolio-api/test/*.test.js  32 passed, 0 failed
node --check admin/admin.js                          passed
node --check admin/sortable-list.js                  passed
git diff --check                                     passed
```
