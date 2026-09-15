# Mobile panel

The same panel supports desktop and phones. On phones, lists appear as readable cards with details
under the selected record, forms use larger controls, and long explanations wrap inside scrollable
reading areas. Completed records remain read-only.

Open navigation with the menu button or swipe right starting anywhere in the leftmost 60 px of the
page, at the top, middle or bottom of the viewport, including after scrolling. The existing gesture
across free header space remains available. Close with the close button, Escape, outside tap or swipe
left across free sidebar space. Navigation entries are links: the address, page title and selected entry refer to the same section.
An accepted navigation closes the sidebar; canceling an unsaved-change prompt keeps the page and menu open. Taps and vertical scrolling
in the edge zone remain native; horizontal movement from that zone opens navigation. Horizontal
scrolling outside that zone remains available.

The schedule remains an employee-by-day matrix. Scroll its days horizontally; the employee name stays
visible. Mobile day selectors and row actions are touch-friendly. Desktop layout and all business
rules remain unchanged. Engineering evidence and device limits: [mobile panel](../engineering/features/mobile-panel.md).

Mobile photo galleries show the current photo and previous/next buttons without a thumbnail strip.
The counter and keyboard navigation remain available; desktop galleries retain thumbnails.

Overview information tips open their explanations without following the card’s navigation action.
Quick navigation preserves the selected tab or record in the address.

Routing uses one shared URL-based navigation system on desktop and mobile. Existing `#/…` links still
work. Changing section adds a browser history step; changing a tab or selected row replaces the current
step. Back and Forward respect unsaved-change confirmation. A link with no record ID opens the list
without restoring a previously selected record. Incident statistics retains its queue return record
in the URL. Returning from employee/checklist details clears the detail ID and opens the list.
