# Portfolio–About Scroll Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TVC and livestream “查看更多” expansion preserve every card animation, keep the final livestream surface stable during the About cover transition, and prevent About/Contact content from overlapping livestream media after refresh.

**Architecture:** Remove the Revision 67 trigger disable/enable cycle. The About transition will pin only the livestream section that is visually behind About, while livestream child triggers declare that pinned container. Expansion will register newly visible items and then perform one ordered global refresh. About owns an opaque page surface for its full content, so its experience timeline cannot reveal the pinned portfolio behind it.

**Tech Stack:** Vanilla JavaScript, GSAP 3.13 ScrollTrigger, CSS, Node test runner.

**Spec:** User screenshot and report from 2026-08-23: expanded livestream animation fails; livestream does not hold correctly at About; refresh overlaps livestream, About experience, and Contact.

## Global Constraints

- Preserve the current hero, TVC visual treatment, livestream carousel interaction, About content, and Contact content.
- Do not publish without an explicit later request.
- Increment the local visible version after the fix.
- Keep one source of truth for the expansion refresh lifecycle.

---

### Task 1: Capture the failed lifecycle as regression tests

**Files:**
- Modify: `tests/works-gsap-motion.test.js`
- Modify: `tests/about-contact-timeline.test.js`

**Interfaces:**
- Consumes: `script.js` and `styles.css` source.
- Produces: assertions for a single refresh coordinator, a livestream-only pin, pinned-container-aware child triggers, and a complete About surface.

- [x] **Step 1: Write failing tests** requiring no `disable()/enable()` pin cycle, `pin: livestream`, `pinnedContainer: livestream`, one `sort()/refresh()` after motion registration, and an opaque About section.
- [x] **Step 2: Run the two focused test files** and confirm failures point to the current Revision 67 lifecycle and transparent About background.

### Task 2: Replace the unstable pin lifecycle

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `refreshWorksMotion(expanded)`, `refreshLivestreamMotion(expanded)`, `livestream`, `ScrollTrigger`.
- Produces: `schedulePortfolioExpansion(refreshMotion, expanded)` and a livestream-only About entrance timeline.

- [x] **Step 1: Remove `suspendAboutStackedEntrance` and its trigger disable/enable state.**
- [x] **Step 2: Make the expansion coordinator wait for layout, register newly visible items, sort triggers, and refresh exactly once.**
- [x] **Step 3: Pin `livestream`, not the full `portfolio-exit`, and declare `pinnedContainer: livestream` for livestream child triggers.**
- [x] **Step 4: Recalibrate all triggers once after TVC and livestream hydration, then confirm focused tests pass.**

### Task 3: Restore a complete About surface

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: `.cinematic-v2 .about`, `.about-stage`, `.about-experience-wrap`.
- Produces: a continuous opaque About surface above the outgoing livestream layer.

- [x] **Step 1: Give the full About section the approved page background while keeping the other sections transparent.**
- [x] **Step 2: Keep the experience wrapper in the About stacking context above the outgoing portfolio.**
- [x] **Step 3: Run focused layout tests.**

### Task 4: Version and full regression

**Files:**
- Modify: `index.html`
- Modify: `README.md`

**Interfaces:**
- Produces: V0.24 Revision 68 cache markers and release history.

- [x] **Step 1: Increment cache markers and the local revision.**
- [x] **Step 2: Run JavaScript syntax validation and all repository tests.**
- [x] **Step 3: Inspect the final diff and commit the local fix without publishing.**
